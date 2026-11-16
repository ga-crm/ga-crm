import { scopeOf } from './scope.js';

describe('scopeOf', () => {
  it('accepts a tenant id', () => {
    const id = '019a7a7e-1234-7abc-8def-0123456789ab';
    expect(scopeOf(id)).toEqual({ tenantId: id });
  });

  it.each([null, undefined, '', 'GA1', '1; DROP TABLE users'])(
    'refuses %s: a scope needs the tenant of the session (CLAUDE.md #2)',
    (value) => {
      expect(() => scopeOf(value)).toThrow();
    },
  );
});
