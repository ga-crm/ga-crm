import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * CMP-4: Cloudflare Turnstile. Without keys a form still works in development and tests (with a
 * warning), and is closed in production. Kept apart so tests replace it.
 */
@Injectable()
export class TurnstileVerifier {
  private readonly logger = new Logger(TurnstileVerifier.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  get siteKey(): string | null {
    return this.config.get('TURNSTILE_SITE_KEY', { infer: true }) || null;
  }

  /** Whether forms may take submissions at all. */
  get available(): boolean {
    return (
      !!this.config.get('TURNSTILE_SECRET_KEY', { infer: true }) ||
      this.config.get('NODE_ENV', { infer: true }) !== 'production'
    );
  }

  async verify(token: string | undefined, ip: string): Promise<boolean> {
    const secret = this.config.get('TURNSTILE_SECRET_KEY', { infer: true });
    if (!secret) {
      this.logger.warn(
        'TURNSTILE_SECRET_KEY is not set; the form is not checked for bots.',
      );
      return this.available;
    }
    if (!token) return false;
    try {
      const response = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await response.json()) as { success?: boolean };
      return body.success === true;
    } catch {
      return false;
    }
  }
}
