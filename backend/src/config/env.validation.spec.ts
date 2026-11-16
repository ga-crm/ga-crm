import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

const BASE = {
  NODE_ENV: 'development',
  APP_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgres://a:b@localhost:5433/x',
  DATABASE_PLATFORM_URL: 'postgres://a:b@localhost:5433/x',
  PLATFORM_ADMIN_EMAIL: 'platform@example.com',
  PLATFORM_ADMIN_PASSWORD: 'long-enough-password',
  PLATFORM_ADMIN_NAME: 'Platform',
};
const SECRETS = {
  AI_KEYS_SECRET: 'a'.repeat(40),
  MFA_KEYS_SECRET: 'b'.repeat(40),
  REDIS_URL: 'redis://localhost:6380',
  S3_BUCKET: 'ga-crm',
};

describe('Environment', () => {
  it('the account switcher can never be on in production', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        ...SECRETS,
        NODE_ENV: 'production',
        DEV_ACCOUNT_SWITCHER: 'true',
      }),
    ).toThrow(/DEV_ACCOUNT_SWITCHER/);
    expect(
      validateEnv({
        ...BASE,
        ...SECRETS,
        NODE_ENV: 'production',
        DEV_ACCOUNT_SWITCHER: 'false',
      }).DEV_ACCOUNT_SWITCHER,
    ).toBe('false');
    expect(
      validateEnv({
        ...BASE,
        NODE_ENV: 'development',
        DEV_ACCOUNT_SWITCHER: 'true',
      }).DEV_ACCOUNT_SWITCHER,
    ).toBe('true');
    // An empty line in .env means "off"
    expect(
      validateEnv({ ...BASE, DEV_ACCOUNT_SWITCHER: '' }).DEV_ACCOUNT_SWITCHER,
    ).toBeUndefined();
  });

  it('NODE_ENV must be set, so a forgotten value never runs a server as development', () => {
    const { NODE_ENV: _unset, ...rest } = BASE;
    expect(() => validateEnv(rest)).toThrow(/NODE_ENV/);
    expect(() => validateEnv({ ...rest, NODE_ENV: '' })).toThrow(/NODE_ENV/);
    expect(() => validateEnv({ ...rest, NODE_ENV: 'prod' })).toThrow(/NODE_ENV/);
  });

  it('USER-16: MFA cannot be made optional in production', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        ...SECRETS,
        NODE_ENV: 'production',
        MFA_ENFORCE: 'false',
      }),
    ).toThrow(/MFA_ENFORCE/);
    expect(validateEnv({ ...BASE, MFA_ENFORCE: 'false' }).MFA_ENFORCE).toBe(
      'false',
    );
  });

  it('production needs Redis so realtime events reach every instance; elsewhere it is optional', () => {
    expect(() =>
      validateEnv({ ...BASE, ...SECRETS, NODE_ENV: 'production', REDIS_URL: '' }),
    ).toThrow(/REDIS_URL/);
    expect(validateEnv({ ...BASE, REDIS_URL: '' }).REDIS_URL).toBeUndefined();
    expect(() => validateEnv({ ...BASE, REDIS_URL: 'http://x' })).toThrow(/REDIS_URL/);
  });
});
