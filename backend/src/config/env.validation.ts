import { plainToInstance, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

const POSTGRES_URL = /^postgres(ql)?:\/\//;

export class Env {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  /** The port the API (backend/) listens on. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT: number = 4200;

  @IsUrl({ require_tld: false })
  APP_URL: string;

  /** TEN-1: role crm_app, always under row-level security. */
  @Matches(POSTGRES_URL)
  DATABASE_URL: string;

  /** TEN-6: role crm_platform, for sign-in, invites and audited platform reads only. */
  @Matches(POSTGRES_URL)
  DATABASE_PLATFORM_URL: string;

  /** Owner role, used by migrations only; the running API never needs it. */
  @IsOptional()
  @Matches(POSTGRES_URL)
  DATABASE_OWNER_URL?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  DATABASE_POOL_SIZE: number = 10;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  TRUST_PROXY_HOPS: number = 0;

  /** Session lifetime, renewed while the user stays active (USER-9). */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  SESSION_TTL_DAYS: number = 7;

  /** Upper limit of a session, however active the user stays. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  SESSION_MAX_DAYS: number = 30;

  @IsEmail()
  PLATFORM_ADMIN_EMAIL: string;

  @IsString()
  @MinLength(8)
  PLATFORM_ADMIN_PASSWORD: string;

  @IsNotEmpty()
  PLATFORM_ADMIN_NAME: string;

  /**
   * AI-15: encrypts each GA's provider keys. Required in production; development and tests fall
   * back to a fixed value (see AiSettingsService). Changing it makes stored keys unreadable.
   */
  @IsOptional()
  @IsString()
  @MinLength(32)
  AI_KEYS_SECRET?: string;

  /** AI-15: platform keys, used when a GA has not entered its own. Empty = none. */
  @IsOptional()
  @IsString()
  AI_PLATFORM_KEY_GEMINI?: string;

  @IsOptional()
  @IsString()
  AI_PLATFORM_KEY_DEEPSEEK?: string;

  @IsOptional()
  @IsString()
  AI_PLATFORM_KEY_QWEN?: string;

  /** USER-16: encrypts each user's TOTP secret. Required in production. */
  @IsOptional()
  @IsString()
  @MinLength(32)
  MFA_KEYS_SECRET?: string;

  /** USER-16: "false" stops forcing MFA on privileged roles (local demos and tests only). */
  @IsOptional()
  @IsIn(['true', 'false'])
  MFA_ENFORCE?: 'true' | 'false';

  /**
   * "true" turns on the account switcher (GET /dev/accounts, POST /dev/switch) for testing roles
   * quickly. Development and test only: the API refuses to start with it on in production.
   */
  @IsOptional()
  @IsIn(['true', 'false'])
  DEV_ACCOUNT_SWITCHER?: 'true' | 'false';

  /** CMP-4: Cloudflare Turnstile. Without a secret, public forms are closed in production. */
  @IsOptional()
  @IsString()
  TURNSTILE_SITE_KEY?: string;

  @IsOptional()
  @IsString()
  TURNSTILE_SECRET_KEY?: string;

  /**
   * Redis / Valkey: carries realtime events between API instances (Socket.IO adapter). Empty keeps
   * them inside one process, which is enough for a single instance. Required in production.
   */
  @IsOptional()
  @Matches(/^rediss?:\/\//)
  REDIS_URL?: string;

  /**
   * Object storage (S3 API) for chat files. A local S3-compatible server sets S3_ENDPOINT (path-style
   * addressing); real S3 leaves it empty. Without S3_BUCKET, uploads are refused. Required in production.
   */
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  S3_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  S3_REGION: string = 'us-east-1';

  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
  S3_BUCKET?: string;

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY_ID?: string;

  @IsOptional()
  @IsString()
  S3_SECRET_ACCESS_KEY?: string;
}

export function validateEnv(config: Record<string, unknown>): Env {
  // An empty line in .env means "not set"
  const cleaned = Object.fromEntries(
    Object.entries(config).filter(
      ([key, value]) =>
        !(
          (key.startsWith('AI_') ||
            key.startsWith('DEV_') ||
            key.startsWith('MFA_') ||
            key.startsWith('TURNSTILE_') ||
            key.startsWith('REDIS_') ||
            key.startsWith('S3_')) &&
          value === ''
        ),
    ),
  );
  const env = plainToInstance(Env, cleaned);
  const errors = validateSync(env);
  if (env.NODE_ENV === 'production' && env.DEV_ACCOUNT_SWITCHER === 'true')
    throw new Error(
      'Invalid environment: DEV_ACCOUNT_SWITCHER must not be on in production.',
    );
  if (env.NODE_ENV === 'production' && !env.AI_KEYS_SECRET)
    throw new Error(
      'Invalid environment: AI_KEYS_SECRET (32+ characters) is required in production.',
    );
  if (env.NODE_ENV === 'production' && !env.MFA_KEYS_SECRET)
    throw new Error(
      'Invalid environment: MFA_KEYS_SECRET (32+ characters) is required in production.',
    );
  if (env.NODE_ENV === 'production' && !env.S3_BUCKET)
    throw new Error(
      'Invalid environment: S3_BUCKET is required in production (chat files).',
    );
  if (env.NODE_ENV === 'production' && !env.REDIS_URL)
    throw new Error(
      'Invalid environment: REDIS_URL is required in production, so realtime events reach every instance.',
    );
  if (errors.length > 0) {
    const details = errors
      .map(
        (error) =>
          `  - ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(
      `Invalid environment. Copy the PG_* and DATABASE_* lines of .env.example into .env.\n${details}`,
    );
  }
  return env;
}
