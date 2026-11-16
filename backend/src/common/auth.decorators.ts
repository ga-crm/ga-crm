import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Actor, Permission, Role } from './rbac.js';

export const SESSION_COOKIE = 'crm_session';

export interface AuthenticatedRequest extends Request {
  actor: Actor;
}

export const IS_PUBLIC_KEY = 'isPublic';
export const PERMISSIONS_KEY = 'permissions';
export const ROLES_KEY = 'roles';
export const ANY_PERMISSION_KEY = 'anyPermission';

export const MFA_PENDING_KEY = 'mfaPending';
export const MFA_SETUP_KEY = 'mfaSetup';

/** USER-16: reachable while the session still waits for the MFA code (verify, sign out). */
export const AllowMfaPending = () => SetMetadata(MFA_PENDING_KEY, true);

/** USER-16: reachable by someone who must set MFA up first (/me, the MFA setup routes, sign out). */
export const AllowMfaSetup = () => SetMetadata(MFA_SETUP_KEY, true);

/** Every route requires a session unless it is marked public (section 17.1). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** The actor must hold all listed permissions. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** The actor must hold at least one of these, for routes shared by two features. */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  SetMetadata(ANY_PERMISSION_KEY, permissions);

/** The actor must hold at least one listed role (GA_HEAD or PLATFORM_ADMIN endpoints). */
export const RequireRoles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().actor,
);
