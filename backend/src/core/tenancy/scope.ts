/**
 * TEN-1 + CLAUDE.md #2: the tenant a request works in. Built on the server from the session,
 * never from client input.
 */
export interface Scope {
  readonly tenantId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function scopeOf(tenantId: string | null | undefined): Scope {
  if (!tenantId || !UUID.test(tenantId))
    throw new Error('A tenant scope needs the tenant id of the session');
  return { tenantId };
}
