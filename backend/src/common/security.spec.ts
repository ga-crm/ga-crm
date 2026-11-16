import { hashPassword, verifyPassword } from './crypto.js';
import { ApiException } from './errors.js';
import { assertStrongPassword } from './password-policy.js';

const errorCode = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (error) {
    return ((error as ApiException).getResponse() as { error: string }).error;
  }
};

describe('assertStrongPassword', () => {
  it('USER-4: refuses common and trivial passwords, ignoring case', () => {
    for (const password of [
      '12345678',
      'Password123',
      'MATKHAU123',
      'aaaaaaaa',
      'abababab',
    ]) {
      expect(
        errorCode(() => assertStrongPassword(password)),
        password,
      ).toBe('password_too_weak');
    }
  });

  it('refuses a password built from the email name', () => {
    const owner = { email: 'nguyen.an@ga.vn' };
    expect(
      errorCode(() => assertStrongPassword('xx-nguyen.an-99', owner)),
    ).toBe('password_too_weak');
  });

  it('accepts a reasonable password', () => {
    expect(
      errorCode(() =>
        assertStrongPassword('Trời-mưa-to-2026', { email: 'an@ga.vn' }),
      ),
    ).toBeNull();
  });
});

describe('password hashing', () => {
  it('verifies the right password and refuses a wrong one', async () => {
    const stored = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('wrong horse', stored)).toBe(false);
  });

  it('refuses work beyond its queue instead of letting everyone wait', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 80 }, () => hashPassword('x')),
    );
    const refused = results.filter((result) => result.status === 'rejected');
    expect(refused.length).toBeGreaterThan(0);
    const reason = (refused[0] as PromiseRejectedResult).reason as ApiException;
    expect((reason.getResponse() as { error: string }).error).toBe(
      'server_busy',
    );
    expect(reason.getStatus()).toBe(503);
  }, 30_000);
});
