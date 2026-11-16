import type { Me, Role } from '../lib/types'

export const hasPermission = (me: Me | null | undefined, permission: string) => !!me?.permissions.includes(permission)
export const hasRole = (me: Me | null | undefined, role: Role) => !!me?.roles.includes(role)
