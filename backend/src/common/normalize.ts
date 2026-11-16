/** DATA-4: `0xxxxxxxxx`, from `+84` and `84` as well. Null when it is not a phone number. */
export function parsePhone(value: string): string | null {
  const digits = value.replace(/[\s.()-]/g, '');
  const match = /^(?:\+?84|0)(\d{9})$/.exec(digits);
  return match ? `0${match[1]}` : null;
}

/** DATA-5: without Vietnamese marks, `đ` as `d`, upper case, single spaces. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * DATA-9: a stable code from a label: no Vietnamese marks, `đ` as `d`, upper case, anything else
 * than letters and digits as `_`, at most 40 characters. Renaming keeps the code.
 */
export function codeFromLabel(label: string): string {
  return normalizeName(label)
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/, '');
}
