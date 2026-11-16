import { HttpStatus } from '@nestjs/common';
import { ApiException, ErrorCode } from './errors.js';

/**
 * USER-4 asks for a check against leaked passwords. This local list stops the most guessed ones
 * without sending anything to a third party; a full breach database is still to be chosen.
 */
const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '0123456789',
  '11111111',
  '00000000',
  '88888888',
  '66668888',
  '12341234',
  '87654321',
  '123123123',
  '123456abc',
  '1234abcd',
  'abcd1234',
  'abc12345',
  'abc123456',
  'a1234567',
  'a12345678',
  'aa123456',
  'password',
  'password1',
  'password123',
  'passw0rd',
  'p@ssw0rd',
  'p@ssword',
  'admin123',
  'admin1234',
  'admin@123',
  'administrator',
  'qwerty123',
  'qwertyuiop',
  '1qaz2wsx',
  '1q2w3e4r',
  '1q2w3e4r5t',
  'iloveyou',
  'iloveyou1',
  'welcome1',
  'welcome123',
  'letmein123',
  'changeme',
  'matkhau',
  'matkhau123',
  'matkhau1',
  'mat-khau-123',
  'anhyeuem',
  'anhyeuem1',
  'emyeuanh',
  'yeuemnhieu',
  'vietnam123',
  'hanoi123',
  'saigon123',
  'dailyichi',
  'daiichi123',
  'gacrm123',
  'crm12345',
]);

const weak = () =>
  new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.PasswordTooWeak);

/** Length is checked by the DTOs. Call before hashing so a rejected password costs nothing. */
export function assertStrongPassword(
  password: string,
  owner?: { email: string },
): void {
  const normalized = password.toLowerCase();
  if (COMMON_PASSWORDS.has(normalized) || new Set(normalized).size < 4)
    throw weak();

  const localPart = owner?.email.split('@')[0].toLowerCase();
  if (localPart && localPart.length >= 4 && normalized.includes(localPart))
    throw weak();
}
