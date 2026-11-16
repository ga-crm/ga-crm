import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { configureApp } from '../../src/configure-app.js';
import { resetTestDatabase } from './database.js';
import { closeOwnerDb } from './owner-db.js';

/**
 * A fresh test database from the migrations, and the app on top of it. `override` replaces
 * providers, such as a fake Turnstile.
 */
export async function startApp(
  override: (builder: TestingModuleBuilder) => TestingModuleBuilder = (
    builder,
  ) => builder,
): Promise<INestApplication> {
  await resetTestDatabase();
  // Imported here, so a suite can change process.env (MFA_ENFORCE) before the config is read
  const { AppModule } = await import('../../src/app.module.js');
  const moduleRef = await override(
    Test.createTestingModule({ imports: [AppModule] }),
  ).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export async function stopApp(app?: INestApplication): Promise<void> {
  await app?.close();
  await closeOwnerDb();
}
