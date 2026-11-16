import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../config/env.validation.js';
import { TurnstileVerifier } from './turnstile.verifier.js';

const verifier = (env: Partial<Env>) =>
  new TurnstileVerifier({
    get: (key: keyof Env) => env[key],
  } as unknown as ConfigService<Env, true>);

describe('CMP-4 Turnstile', () => {
  it('closes forms in production when no secret is set', async () => {
    const production = verifier({ NODE_ENV: 'production' });
    expect(production.available).toBe(false);
    expect(await production.verify('anything', '1.2.3.4')).toBe(false);
  });

  it('lets development run without keys, and needs a token once a secret is set', async () => {
    const development = verifier({ NODE_ENV: 'development' });
    expect(development.available).toBe(true);
    expect(development.siteKey).toBeNull();
    expect(await development.verify(undefined, '1.2.3.4')).toBe(true);
    const keyed = verifier({
      NODE_ENV: 'production',
      TURNSTILE_SECRET_KEY: 's',
      TURNSTILE_SITE_KEY: 'k',
    });
    expect(keyed.available).toBe(true);
    expect(keyed.siteKey).toBe('k');
    expect(await keyed.verify(undefined, '1.2.3.4')).toBe(false);
  });
});
