import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import {
  ApiException,
  ErrorCode,
  forbidden,
  notFound,
} from '../../common/errors.js';
import type { Actor, Scope } from '../../common/rbac.js';
import type { Env } from '../../config/env.validation.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { AiProviderClient, AiProviderFailure } from './ai-provider.client.js';
import { AI_PROVIDERS, AI_TIERS, providerOf } from './ai-providers.js';
import type { AiTier } from './ai-providers.js';
import type { UpdateAiSettingsDto } from './ai.dto.js';
import { decryptKey, encryptKey } from './key-crypto.js';

/** Development and tests only; production refuses to start without AI_KEYS_SECRET. */
const DEV_SECRET = 'ga-crm-development-ai-keys-secret-not-for-production';

const FAILURE_STATUS: Record<AiProviderFailure['code'], number> = {
  ai_key_invalid: HttpStatus.BAD_REQUEST,
  ai_model_unavailable: HttpStatus.BAD_REQUEST,
  ai_rate_limited: HttpStatus.TOO_MANY_REQUESTS,
  ai_provider_error: HttpStatus.BAD_GATEWAY,
};

export interface ModelRef {
  provider: string;
  model: string;
}

/** AI-11: the first provider's suggested models, until the GA chooses. */
export const defaultTiers = (): Record<AiTier, ModelRef> => {
  const first = AI_PROVIDERS[0];
  return {
    FAST: { provider: first.id, model: first.suggested.FAST },
    BALANCED: { provider: first.id, model: first.suggested.BALANCED },
    DEEP: { provider: first.id, model: first.suggested.DEEP },
  };
};

interface StoredSettings {
  enabled: boolean;
  tiers: Record<AiTier, ModelRef>;
  router: ModelRef;
  monthlyTokenLimit: number;
  updatedAt: Date | null;
}

interface StoredKey {
  provider: string;
  encryptedKey: string;
  last4: string;
  updatedAt: Date;
}

export type KeySource = 'GA' | 'PLATFORM' | null;

/** Section 14.4 and AI-13: the GA's provider keys, models by tier, router and budget. */
@Injectable()
export class AiSettingsService {
  private readonly logger = new Logger(AiSettingsService.name);
  private readonly secret: string;

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
    private readonly client: AiProviderClient,
    private readonly config: ConfigService<Env, true>,
    private readonly tenants: TenantsService,
  ) {
    const configured = this.config.get('AI_KEYS_SECRET', { infer: true });
    if (!configured)
      this.logger.warn(
        'AI_KEYS_SECRET is not set; using the development secret.',
      );
    this.secret = configured ?? DEV_SECRET;
  }

  private scopeOf(actor: Actor): Scope {
    if (!actor.tenantId) throw forbidden();
    return { tenantId: actor.tenantId };
  }

  private provider(id: string) {
    const entry = providerOf(id);
    if (!entry) throw notFound();
    return entry;
  }

  private platformKey(id: string): string | null {
    const entry = providerOf(id);
    return (
      (entry && this.config.get(entry.platformKeyEnv, { infer: true })) || null
    );
  }

  private open(scope: Scope, provider: string, stored: string): string | null {
    return decryptKey(this.secret, `${scope.tenantId}:${provider}`, stored);
  }

  /** The GA's settings, created with the defaults on first read. */
  private async current(
    db: EntityManager,
    scope: Scope,
    lock = false,
  ): Promise<StoredSettings> {
    const defaults = defaultTiers();
    await db.query(
      `INSERT INTO ai_settings (tenant_id, tiers, router) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [scope.tenantId, JSON.stringify(defaults), JSON.stringify(defaults.FAST)],
    );
    const [row] = await rowsOf<
      Omit<StoredSettings, 'monthlyTokenLimit'> & { monthlyTokenLimit: string }
    >(
      db,
      `SELECT enabled, tiers, router, monthly_token_limit AS "monthlyTokenLimit",
              updated_at AS "updatedAt"
         FROM ai_settings WHERE tenant_id = $1 ${lock ? 'FOR UPDATE' : ''}`,
      [scope.tenantId],
    );
    return { ...row, monthlyTokenLimit: Number(row.monthlyTokenLimit) };
  }

  private storedKeys(
    db: EntityManager,
    scope: Scope,
    provider?: string,
  ): Promise<StoredKey[]> {
    return rowsOf<StoredKey>(
      db,
      `SELECT provider, encrypted_key AS "encryptedKey", last4, updated_at AS "updatedAt"
         FROM ai_provider_keys WHERE tenant_id = $1 ${provider ? 'AND provider = $2' : ''}`,
      provider ? [scope.tenantId, provider] : [scope.tenantId],
    );
  }

  /**
   * AI-15: the key a call uses: the GA's own, else the platform's, else none. Other slices call
   * this; the key never leaves the server.
   */
  async resolveKey(
    scope: Scope,
    provider: string,
    outer?: EntityManager,
  ): Promise<{ key: string; source: Exclude<KeySource, null> } | null> {
    const [stored] = await this.tenantDb.run(
      scope,
      (db) => this.storedKeys(db, scope, provider),
      outer,
    );
    const own = stored ? this.open(scope, provider, stored.encryptedKey) : null;
    if (own) return { key: own, source: 'GA' };
    const platform = this.platformKey(provider);
    return platform ? { key: platform, source: 'PLATFORM' } : null;
  }

  /** Section 17.13 GET /ai/admin/settings */
  async view(actor: Actor) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const settings = await this.current(db, scope);
      const stored = await this.storedKeys(db, scope);
      const providers = AI_PROVIDERS.map((entry) => {
        const key = stored.find((item) => item.provider === entry.id);
        const readable = key
          ? this.open(scope, entry.id, key.encryptedKey) !== null
          : false;
        const platform = this.platformKey(entry.id) !== null;
        const keySource: KeySource = readable
          ? 'GA'
          : platform
            ? 'PLATFORM'
            : null;
        return {
          provider: entry.id,
          label: entry.label,
          ready: keySource !== null,
          keySource,
          last4: key?.last4 ?? null,
          keyUpdatedAt: key?.updatedAt ?? null,
          keyUnreadable: !!key && !readable,
          suggested: entry.suggested,
        };
      });
      return {
        enabled: settings.enabled,
        tiers: settings.tiers,
        router: settings.router,
        monthlyTokenLimit: settings.monthlyTokenLimit,
        planTokenLimit: (await this.tenants.limits(scope, db)).aiTokensPerMonth,
        // AI-13: counted from the assistants' messages once they answer (slice 7b)
        usedThisMonth: 0,
        updatedAt: settings.updatedAt,
        providers,
      };
    });
  }

  /** Section 17.13 PUT /ai/admin/settings. Audited with before and after. */
  async update(actor: Actor, dto: UpdateAiSettingsDto): Promise<void> {
    const scope = this.scopeOf(actor);
    const plain = (ref: ModelRef): ModelRef => ({
      provider: ref.provider,
      model: ref.model,
    });
    const after = {
      enabled: dto.enabled,
      tiers: Object.fromEntries(
        AI_TIERS.map((tier) => [tier, plain(dto.tiers[tier])]),
      ) as Record<AiTier, ModelRef>,
      router: plain(dto.router),
      monthlyTokenLimit: dto.monthlyTokenLimit,
    };
    await this.tenantDb.run(scope, async (db) => {
      // Section 5.2: the GA's own limit stays within its plan (0 = "no limit" is not allowed then)
      const { aiTokensPerMonth } = await this.tenants.limits(scope, db);
      if (
        aiTokensPerMonth !== null &&
        (dto.monthlyTokenLimit === 0 ||
          dto.monthlyTokenLimit > aiTokensPerMonth)
      )
        throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.PlanAiLimit);
      // Locked, so two saves cannot both read the same "before"
      const before = await this.current(db, scope, true);
      await db.query(
        `UPDATE ai_settings
            SET enabled = $2, tiers = $3, router = $4, monthly_token_limit = $5,
                updated_by = $6, updated_at = now()
          WHERE tenant_id = $1`,
        [
          scope.tenantId,
          after.enabled,
          JSON.stringify(after.tiers),
          JSON.stringify(after.router),
          after.monthlyTokenLimit,
          actor.id,
        ],
      );
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.SettingsChange,
          entity: 'ai_settings',
          meta: {
            before: {
              enabled: before.enabled,
              tiers: before.tiers,
              router: before.router,
              monthlyTokenLimit: before.monthlyTokenLimit,
            },
            after,
          },
        },
        db,
      );
    });
  }

  /** AI-15: write-only; the audit names the provider and the last 4 characters, never the key. */
  async saveKey(actor: Actor, provider: string, apiKey: string) {
    const scope = this.scopeOf(actor);
    this.provider(provider);
    const last4 = apiKey.slice(-4);
    await this.tenantDb.run(scope, async (db) => {
      await db.query(
        `INSERT INTO ai_provider_keys (tenant_id, provider, encrypted_key, last4, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, provider) DO UPDATE
           SET encrypted_key = EXCLUDED.encrypted_key, last4 = EXCLUDED.last4,
               updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [
          scope.tenantId,
          provider,
          encryptKey(this.secret, `${scope.tenantId}:${provider}`, apiKey),
          last4,
          actor.id,
        ],
      );
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'ai_key',
          entityId: provider,
          meta: { provider, last4 },
        },
        db,
      );
    });
    return { ok: true, last4 };
  }

  async deleteKey(actor: Actor, provider: string): Promise<void> {
    const scope = this.scopeOf(actor);
    this.provider(provider);
    await this.tenantDb.run(scope, async (db) => {
      await db.query(
        `DELETE FROM ai_provider_keys WHERE tenant_id = $1 AND provider = $2`,
        [scope.tenantId, provider],
      );
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Delete,
          entity: 'ai_key',
          entityId: provider,
          meta: { provider },
        },
        db,
      );
    });
  }

  private async keyOrFail(actor: Actor, provider: string) {
    const scope = this.scopeOf(actor);
    this.provider(provider);
    const resolved = await this.resolveKey(scope, provider);
    if (!resolved)
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.AiProviderMissing,
      );
    return { scope, key: resolved.key };
  }

  private fail(error: unknown): never {
    if (error instanceof AiProviderFailure)
      throw new ApiException(FAILURE_STATUS[error.code], error.code);
    throw error;
  }

  /** AI-17: the provider's chat models, read live. */
  async models(actor: Actor, provider: string) {
    const { key } = await this.keyOrFail(actor, provider);
    try {
      return { items: await this.client.listModels(provider, key) };
    } catch (error) {
      this.fail(error);
    }
  }

  /**
   * AI-16: a 5-token request on the model the GA uses with this provider, or its suggestion. The
   * call to the provider happens outside any transaction, so a slow provider holds no connection.
   */
  async test(actor: Actor, provider: string) {
    const { scope, key } = await this.keyOrFail(actor, provider);
    const settings = await this.tenantDb.run(scope, (db) =>
      this.current(db, scope),
    );
    const model =
      AI_TIERS.map((tier) => settings.tiers?.[tier]).find(
        (ref) => ref?.provider === provider,
      )?.model ?? this.provider(provider).suggested.FAST;
    try {
      await this.client.ping(provider, key, model);
    } catch (error) {
      this.fail(error);
    }
    return { ok: true, model };
  }
}
