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
  // Wrapped because Nest skips its own parser for every route once it sees one named jsonParser
  const importsBody = json({ limit: '4mb' });
  app.use(
    '/api/v1/imports',
    (req: Request, res: Response, next: NextFunction) =>
      importsBody(req, res, next),
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
