import type { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { SESSION_COOKIE } from '../../common/auth.decorators.js';
import type { Env } from '../../config/env.validation.js';

const isProduction = (config: ConfigService<Env, true>) =>
  config.get('NODE_ENV', { infer: true }) === 'production';

/** The __Host- prefix makes browsers refuse the cookie unless it is Secure and set by this exact host. */
const cookieName = (config: ConfigService<Env, true>) =>
  isProduction(config) ? `__Host-${SESSION_COOKIE}` : SESSION_COOKIE;

function cookieOptions(config: ConfigService<Env, true>): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(config),
    path: '/',
  };
}

export function readSessionToken(
  req: Request,
  config: ConfigService<Env, true>,
): string | undefined {
  const token = (req.cookies as Record<string, unknown>)[cookieName(config)];
  return typeof token === 'string' ? token : undefined;
}

/** The same token read from a raw Cookie header, for the WebSocket handshake (no Express parser there). */
export function readSessionTokenFromHeader(
  header: string | undefined,
  config: ConfigService<Env, true>,
): string | undefined {
  const name = cookieName(config);
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0 || part.slice(0, at).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(at + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function setSessionCookie(
  res: Response,
  token: string,
  maxAge: number,
  config: ConfigService<Env, true>,
): void {
  res.cookie(cookieName(config), token, { ...cookieOptions(config), maxAge });
}

export function clearSessionCookie(
  res: Response,
  config: ConfigService<Env, true>,
): void {
  res.clearCookie(cookieName(config), cookieOptions(config));
}
