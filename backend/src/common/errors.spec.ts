import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ErrorCode } from './errors.js';

describe('error catalogue', () => {
  it('UI-2: every API error code has a Vietnamese message', () => {
    const catalogue = JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, '../../../frontend/src/i18n/vi.json'),
        'utf8',
      ),
    ) as Record<string, string>;

    for (const code of Object.values(ErrorCode)) {
      expect(catalogue[`errors.${code}`], code).toBeTruthy();
    }
  });
});
