import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

// Client-controlled, and stored in the audit log for every event
const MAX_USER_AGENT_LENGTH = 256;

const storage = new AsyncLocalStorage<RequestContext>();

export const getRequestContext = (): RequestContext | undefined =>
  storage.getStore();

export function requestContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  storage.run(
    {
      ip: req.ip,
      userAgent: req.get('user-agent')?.slice(0, MAX_USER_AGENT_LENGTH),
    },
    next,
  );
}
