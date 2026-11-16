import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { sha256 } from '../../common/crypto.js';
import {
  ApiException,
  ErrorCode,
  forbidden,
  notFound,
} from '../../common/errors.js';
import { parsePhone } from '../../common/normalize.js';
import { isId } from '../../common/pagination.js';
import { Permission } from '../../common/rbac.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { PlatformDb } from '../../core/tenancy/platform-db.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Campaign } from '../leads/infrastructure/lead.entities.js';
import type { PublicForm } from '../leads/infrastructure/lead.entities.js';
import { LeadsService } from '../leads/leads.service.js';
import type {
  PublicFormSettingsDto,
  SubmitFormDto,
} from './public-form.dto.js';
import { TurnstileVerifier } from './turnstile.verifier.js';

/** CMP-4: at most this many submissions per phone number and GA each day. */
const PER_PHONE_PER_DAY = 3;
const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

const newSlug = (): string =>
  [...randomBytes(10)]
    .map((byte) => SLUG_ALPHABET[byte % SLUG_ALPHABET.length])
    .join('');

/** Today in Vietnam (DATA-2), as YYYY-MM-DD. */
const vietnamDay = (): string =>
  new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

/** A campaign whose form is open, with what its page shows about the GA. */
interface OpenForm {
  campaign: Campaign & { publicForm: PublicForm };
  gaName: string;
}

/** CMP-4: the public lead form of a campaign, its settings and its submissions. */
@Injectable()
export class PublicFormService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly platformDb: PlatformDb,
    private readonly leads: LeadsService,
    private readonly audit: AuditService,
    private readonly turnstile: TurnstileVerifier,
  ) {}

  /** CMP-5: only campaigns.manage changes a form. Keeps the slug once given, so printed QR codes work. */
  async configure(actor: Actor, id: string, dto: PublicFormSettingsDto) {
    if (!actor.tenantId) throw forbidden();
    if (!actor.permissions.includes(Permission.CampaignsManage))
      throw forbidden();
    if (!isId(id)) throw notFound();
    const scope: Scope = { tenantId: actor.tenantId };
    return this.tenantDb.run(scope, async (db) => {
      const campaigns = db.getRepository(Campaign);
      const campaign = await campaigns
        .createQueryBuilder('campaign')
        .where('campaign.tenantId = :tenantId AND campaign.id = :id', {
          tenantId: scope.tenantId,
          id,
        })
        .setLock('pessimistic_write')
        .getOne();
      if (!campaign) throw notFound();
      const form: PublicForm = {
        slug: campaign.publicForm?.slug ?? newSlug(),
        enabled: dto.enabled,
        fields: [...dto.fields],
        consentText: dto.consentText,
        privacyNotice: dto.privacyNotice,
        updatedAt: new Date(),
      };
      await campaigns.update(
        { id: campaign.id, tenantId: scope.tenantId },
        { publicForm: form as never, updatedAt: form.updatedAt },
      );
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'campaign',
          entityId: id,
          meta: { publicForm: { enabled: form.enabled, fields: form.fields } },
        },
        db,
      );
      return form;
    });
  }

  /**
   * The campaign behind a slug, open for submissions. Like an invite lookup, the slug is the only
   * key, so this one read crosses tenants (TEN-6).
   */
  private async open(slug: string): Promise<OpenForm> {
    if (!/^[a-z0-9]{6,20}$/.test(slug)) throw notFound();
    const found = await this.platformDb.run('public-form', async (db) => {
      const campaign = await db
        .getRepository(Campaign)
        .createQueryBuilder('campaign')
        .where("campaign.publicForm ->> 'slug' = :slug", { slug })
        .getOne();
      if (!campaign?.publicForm) return null;
      const [tenant] = await rowsOf<{ status: string; name: string }>(
        db,
        `SELECT t.status, coalesce(nullif(s.profile ->> 'displayName', ''), t.name) AS name
           FROM tenants t LEFT JOIN tenant_settings s ON s.tenant_id = t.id
          WHERE t.id = $1`,
        [campaign.tenantId],
      );
      return { campaign, tenant };
    });
    if (!found) throw notFound();
    const { campaign, tenant } = found;
    const form = campaign.publicForm!;
    const closed =
      !form.enabled ||
      campaign.status === 'ENDED' ||
      (!!campaign.endDate && campaign.endDate < vietnamDay()) ||
      !this.turnstile.available ||
      tenant?.status !== 'active';
    if (closed)
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.FormUnavailable);
    return {
      campaign: campaign as Campaign & { publicForm: PublicForm },
      gaName: tenant.name,
    };
  }

  /** Section 17.9 GET /public/forms/{slug}: what the page shows. Nothing about leads. */
  async definition(slug: string) {
    const { campaign, gaName } = await this.open(slug);
    return {
      gaName,
      campaignName: campaign.name,
      fields: campaign.publicForm.fields,
      consentText: campaign.publicForm.consentText,
      privacyNotice: campaign.publicForm.privacyNotice,
      turnstileSiteKey: this.turnstile.siteKey,
    };
  }

  /** CMP-4: counts one use of a phone number today; true when it is over the limit. */
  private async overLimit(scope: Scope, phone: string): Promise<boolean> {
    const now = new Date();
    return this.tenantDb.run(scope, async (db) => {
      // What MongoDB's TTL did: yesterday's counters go
      await db.query(
        `DELETE FROM form_hits WHERE tenant_id = $1 AND expires_at < $2`,
        [scope.tenantId, now],
      );
      const [hit] = await rowsOf<{ count: number }>(
        db,
        `INSERT INTO form_hits (tenant_id, key, count, expires_at)
         VALUES ($1, $2, 1, $3)
         ON CONFLICT (tenant_id, key) DO UPDATE SET count = form_hits.count + 1
         RETURNING count`,
        [
          scope.tenantId,
          `phone:${sha256(phone)}:${vietnamDay()}`,
          new Date(now.getTime() + 2 * 86_400_000),
        ],
      );
      return hit.count > PER_PHONE_PER_DAY;
    });
  }

  /** Section 17.9 POST /public/forms/{slug}. Always the same answer, so it never reveals a number. */
  async submit(
    slug: string,
    dto: SubmitFormDto,
    ip: string,
  ): Promise<{ ok: true }> {
    const { campaign } = await this.open(slug);
    if (!(await this.turnstile.verify(dto.turnstileToken, ip)))
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.CaptchaFailed);
    const phone = parsePhone(dto.phone);
    if (!phone)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidPhone, {
        issues: [{ path: 'phone', message: 'invalid_phone' }],
      });
    // CMP-4: per phone number, so one number cannot flood a GA
    if (await this.overLimit({ tenantId: campaign.tenantId }, phone))
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.RateLimited,
      );
    const asked = new Set(campaign.publicForm.fields);
    await this.leads.createFromForm(
      campaign,
      {
        fullName: dto.fullName,
        phone,
        ...(asked.has('email') &&
          dto.email && { email: dto.email.toLowerCase() }),
        ...(asked.has('province') &&
          dto.province && { province: dto.province }),
        ...(asked.has('need') && dto.need && { need: dto.need }),
      },
      // PDP: the IP itself is never stored
      sha256(`${campaign.tenantId}:${ip}`),
    );
    return { ok: true };
  }
}
