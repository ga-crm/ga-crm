import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRootEnv } from './load-env.js';

describe('loadRootEnv', () => {
  const keys = ['T_DB', 'T_PORT', 'T_URL', 'T_SET'];
  afterEach(() => keys.forEach((key) => delete process.env[key]));

  const file = (content: string) => {
    const path = join(mkdtempSync(join(tmpdir(), 'env-')), '.env');
    writeFileSync(path, content);
    return path;
  };

  it('expands ${VAR} from the file', () => {
    loadRootEnv(
      file('T_DB=ga_crm\nT_PORT=5433\nT_URL=pg://h:${T_PORT}/${T_DB}\n'),
    );
    expect(process.env.T_URL).toBe('pg://h:5433/ga_crm');
  });

  it('lets the environment win, including inside expanded values', () => {
    process.env.T_DB = 'ga_crm_test';
    process.env.T_SET = 'kept';
    loadRootEnv(file('T_DB=ga_crm\nT_SET=file\nT_URL=pg://h/${T_DB}\n'));
    expect(process.env.T_URL).toBe('pg://h/ga_crm_test');
    expect(process.env.T_SET).toBe('kept');
  });
});
