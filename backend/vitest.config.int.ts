import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.int-spec.ts', 'test/**/*.e2e-spec.ts'],
    // The spec files share one test database
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Its own database, never the dev data. DATABASE_*_URL expand from PG_DB (config/load-env.ts).
    // MFA is forced only in the suite that tests it (test/mfa.e2e-spec.ts)
    // Redis database 15, never the dev data in database 0; suites that use it flush it first
    env: {
      NODE_ENV: 'test',
      PG_DB: 'ga_crm_test',
      MFA_ENFORCE: 'false',
      REDIS_URL: 'redis://localhost:6380/15',
      // Its own bucket on the local MinIO, created on start and emptied by the suites that use it
      S3_BUCKET: 'ga-crm-test',
    },
    setupFiles: ['./test/support/load-env.ts'],
  },
});
