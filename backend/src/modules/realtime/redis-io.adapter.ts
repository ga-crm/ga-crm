import type { INestApplicationContext } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Section 9.1: with more than one API instance, events published on one reach sockets held by the
 * others through Redis pub/sub. Redis is a cache here (section 7): while it is down, each instance
 * still reaches its own sockets, publishes wait in the client's queue, and ioredis keeps reconnecting.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly log = new Logger(RedisIoAdapter.name);
  private readonly pub: Redis;
  private readonly sub: Redis;

  constructor(app: INestApplicationContext, url: string) {
    super(app);
    // Never reject a command: the adapter does not catch publish errors, and an unhandled
    // rejection would stop the process
    this.pub = new Redis(url, {
      maxRetriesPerRequest: null,
      connectionName: 'ga-crm-realtime-pub',
    });
    this.sub = this.pub.duplicate({ connectionName: 'ga-crm-realtime-sub' });
    let down = false;
    for (const client of [this.pub, this.sub]) {
      client.on('error', (error: Error) => {
        if (!down)
          this.log.warn(
            `Redis unavailable, realtime events stay on this instance: ${error.message}`,
          );
        down = true;
      });
      client.on('ready', () => {
        if (down) this.log.log('Redis reconnected');
        down = false;
      });
    }
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    server.adapter(createAdapter(this.pub, this.sub));
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    await Promise.allSettled([this.pub.quit(), this.sub.quit()]);
  }
}
