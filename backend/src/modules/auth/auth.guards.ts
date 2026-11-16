import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { InjectThrottlerStorage, ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  IS_PUBLIC_KEY,
  MFA_PENDING_KEY,
  MFA_SETUP_KEY,
  PERMISSIONS_KEY,
  ROLES_KEY,
  ANY_PERMISSION_KEY,
} from '../../common/auth.decorators.js';
import type { AuthenticatedRequest } from '../../common/auth.decorators.js';
import {
  ApiException,
  ErrorCode,
  forbidden,
  unauthenticated,
} from '../../common/errors.js';
import type { Permission, Role } from '../../common/rbac.js';
import type { Env } from '../../config/env.validation.js';
import { PresenceService } from '../presence/presence.service.js';
import { AuthService } from './auth.service.js';
import { readSessionToken, setSessionCookie } from './session-cookie.js';

const USER_LIMIT_PER_MINUTE = 600;

/** The per-IP limit of REST requests; WebSocket messages have their own per-socket limits. */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    return context.getType() !== 'http' || super.shouldSkip(context);
  }
}
 // Section 17.1
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The app's origin, plus Swagger (served by the API) outside production. */
export function allowedOrigins(config: ConfigService<Env, true>): Set<string> {
  const allowed = new Set([new URL(config.get('APP_URL', { infer: true })).origin]);
  if (config.get('NODE_ENV', { infer: true }) !== 'production')
    allowed.add(`http://localhost:${config.get('API_PORT', { infer: true })}`);
  return allowed;
}

/**
 * USER-18: mutating requests must come from the app's origin. Browsers always send Origin on these
 * requests, so a missing header means a non-browser client, which carries no ambient cookie risk.
 */
@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly allowed: Set<string>;

  constructor(config: ConfigService<Env, true>) {
    this.allowed = allowedOrigins(config);
  }

  canActivate(context: ExecutionContext): boolean {
    // WebSocket messages: the handshake already checked the session and origin (RealtimeGateway)
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.get('origin');
    if (origin) {
      if (this.allowed.has(origin)) return true;
      throw forbidden();
    }
    // Some browsers omit Origin; Fetch Metadata still says where the request came from
    const site = request.get('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') throw forbidden();
    return true;
  }
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
    private readonly presence: PresenceService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // WebSocket messages: the handshake already checked the session and origin (RealtimeGateway)
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionToken(request, this.config);
    const result = await this.auth.authenticate(token);
    if (!result) throw unauthenticated();

    // USER-16: a session waiting for its code, or an account that must set MFA up, opens little
    const allowed = (key: string) =>
      this.reflector.getAllAndOverride<boolean>(key, [
        context.getHandler(),
        context.getClass(),
      ]);
    if (result.mfa === 'pending' && !allowed(MFA_PENDING_KEY))
      throw new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.MfaRequired);
    if (result.mfa === 'setup' && !allowed(MFA_SETUP_KEY))
      throw new ApiException(HttpStatus.FORBIDDEN, ErrorCode.MfaSetupRequired);

    request.actor = result.actor;
    // Daily active users: one Redis write per person per day and instance, never awaited
    if (!result.mfa) this.presence.countRequest(result.actor);
    if (result.renewed && token)
      setSessionCookie(
        context.switchToHttp().getResponse(),
        token,
        this.auth.sessionTtlMs,
        this.config,
      );
    return true;
  }
}

/** Section 17.1: per user, so people behind one office IP do not use up each other's allowance. */
@Injectable()
export class UserRateLimitGuard implements CanActivate {
  constructor(
    @InjectThrottlerStorage() private readonly storage: ThrottlerStorage,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // WebSocket messages: the handshake already checked the session and origin (RealtimeGateway)
    if (context.getType() !== 'http') return true;
    const { actor } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!actor || this.config.get('NODE_ENV', { infer: true }) === 'test') {
      return true;
    }

    const usage = await this.storage.increment(
      `user:${actor.id}`,
      60_000,
      USER_LIMIT_PER_MINUTE,
      0,
      'user',
    );
    if (usage.totalHits > USER_LIMIT_PER_MINUTE) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.RateLimited,
        undefined,
        usage.timeToExpire,
      );
    }
    return true;
  }
}

/** Section 2.5 step 5: PERM-4 says the API checks permissions regardless of what the UI hides. */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // WebSocket messages: the handshake already checked the session and origin (RealtimeGateway)
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    const permissions = this.reflector.getAllAndOverride<
      Permission[] | undefined
    >(PERMISSIONS_KEY, targets);
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      targets,
    );
    const anyOf = this.reflector.getAllAndOverride<Permission[] | undefined>(
      ANY_PERMISSION_KEY,
      targets,
    );
    if (anyOf?.length) {
      const { actor } = context
        .switchToHttp()
        .getRequest<AuthenticatedRequest>();
      if (!anyOf.some((item) => actor.permissions.includes(item))) {
        throw forbidden();
      }
    }
    if (!permissions?.length && !roles?.length) return true;

    const { actor } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const hasPermissions =
      permissions?.every((permission) =>
        actor.permissions.includes(permission),
      ) ?? true;
    const hasRole = roles?.some((role) => actor.roles.includes(role)) ?? true;
    if (!hasPermissions || !hasRole) throw forbidden();
    return true;
  }
}
