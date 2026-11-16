import '../config/load-env.side-effect.js';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { Env } from '../config/env.validation.js';
import { AppModule } from '../app.module.js';
import { PlatformDb } from '../core/tenancy/platform-db.js';
import { DEMO_TENANTS, seedDemoData } from './demo-data.js';
import { applyDemoPasswords, DEMO_PASSWORD, seedShowcase } from './showcase.js';

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
try {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  if (config.get('NODE_ENV', { infer: true }) === 'production')
    throw new Error('The demo seed must not run in production.');
  await seedDemoData(app, DEMO_PASSWORD);
  const added = await seedShowcase(app, DEMO_PASSWORD);

  // Demo accounts and the Platform Admin sign in with the demo password, wherever they came from
  const platformEmail = config
    .get('PLATFORM_ADMIN_EMAIL', { infer: true })
    .toLowerCase();
  await applyDemoPasswords(app, DEMO_PASSWORD, platformEmail);
  const counts = await app
    .get(PlatformDb)
    .run('platform-console', async (db) => {
      const [row] = (await db.query(
        `SELECT (SELECT count(*) FROM tenants)::int AS tenants,
              (SELECT count(*) FROM users)::int AS users,
              (SELECT count(*) FROM agents)::int AS agents,
              (SELECT count(*) FROM leads)::int AS leads,
              (SELECT count(*) FROM tasks)::int AS tasks,
              (SELECT count(*) FROM interactions)::int AS notes,
              (SELECT count(*) FROM comments)::int AS comments,
              (SELECT count(*) FROM clients)::int AS clients,
              (SELECT count(*) FROM imports)::int AS imports`,
      )) as Record<string, number>[];
      return row;
    });
  console.log(
    added.leads > 0
      ? 'Demo data created.'
      : 'Demo data already exists, nothing added. Passwords were set again.',
  );
  console.log(
    `In PostgreSQL: ${counts.tenants} GA, ${counts.users} users, ${counts.agents} agents, ${counts.leads} leads, ` +
      `${counts.tasks} tasks, ${counts.notes} notes and contacts, ${counts.comments} comments, ` +
      `${counts.clients} clients, ${counts.imports} imports.`,
  );
  console.log(`Password of every demo account: ${DEMO_PASSWORD}`);
  console.log(`  Platform admin   ${platformEmail}`);
  console.log(
    '  head@ / admin@ / marketing@ / gad@ / bm@ / um@ / fc@gaN.gacrm.local, N being the GA:',
  );
  for (const { number, name } of DEMO_TENANTS)
    console.log(`    ga${number}  ${name}`);
} finally {
  await app.close();
}
