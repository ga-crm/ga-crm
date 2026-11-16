import './config/load-env.side-effect.js';
import type { Server } from 'node:http';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { SESSION_COOKIE } from './common/auth.decorators.js';
import type { Env } from './config/env.validation.js';
import { configureApp } from './configure-app.js';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get('API_PORT', { infer: true });

  configureApp(app);
  // Section 9.1: realtime events cross instances through Redis; without it they stay in this process
  const redisUrl = config.get('REDIS_URL', { infer: true });
  if (redisUrl) app.useWebSocketAdapter(new RedisIoAdapter(app, redisUrl));
  app.enableShutdownHooks();

  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('GA CRM API (PostgreSQL)')
        .setDescription(
          'Cách dùng: gọi `POST /api/v1/auth/sign-in/email`. Trình duyệt tự lưu session cookie, các API khác dùng được ngay, không cần bấm Authorize.\n\n' +
            'Tài khoản demo sau khi chạy `npm run seed`: `head@ga1.gacrm.local`, mật khẩu `Demo@2026`. ' +
            'Lỗi luôn có dạng `{ "error": "<code>", "issues"?: [...] }`.',
        )
        .setVersion('1.0')
        .addCookieAuth(SESSION_COOKIE)
        .build(),
    );
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'api/v1/openapi.json',
      swaggerOptions: { persistAuthorization: true, withCredentials: true },
    });
  }

  await app.listen(port);

  // Slow-client protection: a connection cannot hold a socket by sending a request very slowly
  const server = app.getHttpServer() as Server;
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 65_000;
  new Logger('Bootstrap').log(
    `API (PostgreSQL): http://localhost:${port}/api/v1 | Swagger: http://localhost:${port}/docs`,
  );
}
await bootstrap();
