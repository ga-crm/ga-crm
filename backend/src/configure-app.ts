import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { validationException } from './common/errors.js';
import type { Env } from './config/env.validation.js';
import { readSessionTokenFromHeader } from './modules/auth/session-cookie.js';
import { requestContextMiddleware } from './common/request-context.js';

/** Shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));

  app.use(helmet());
  // Responses hold personal data, so shared caches and the browser's back-forward cache must not keep them
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  // Section 17.10: a chunk of 500 rows is larger than the default limit of every other route.
  // Wrapped because Nest skips its own parser for every route once it sees one named jsonParser.
  // This runs before the session guard and the rate limits, so it must stay cheap for strangers:
  // no gzip (4 KB compressed can inflate to 4 MB and block the event loop), and only for a request
  // that carries a session cookie. Without one, Nest's own 100 KB parser answers and the guard
  // then refuses it.
  const importsBody = json({ limit: '4mb', inflate: false });
  app.use(
    '/api/v1/imports',
    (req: Request, res: Response, next: NextFunction) => {
      if (!readSessionTokenFromHeader(req.headers.cookie, config)) {
        next();
        return;
      }
      importsBody(req, res, next);
    },
  );
  app.use(cookieParser());
  app.use(requestContextMiddleware);
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationException,
    }),
  );
}
