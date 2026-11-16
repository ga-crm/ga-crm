import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Readable } from 'node:stream';
import type { Env } from '../../config/env.validation.js';

/**
 * Files outside the database (docs/thiet-ke-he-thong.md: S3). Keys always start with the tenant
 * (`t/<tenantId>/...`) so a GA's files can be listed, measured or removed together. The API checks
 * who may read a file and streams it; browsers never get bucket URLs.
 */
@Injectable()
export class ObjectStorage implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ObjectStorage.name);
  private readonly client: S3Client | null;
  private readonly bucket: string | undefined;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    const accessKeyId = config.get('S3_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('S3_SECRET_ACCESS_KEY', { infer: true });
    this.client = this.bucket
      ? new S3Client({
          region: config.get('S3_REGION', { infer: true }),
          ...(endpoint && { endpoint, forcePathStyle: true }),
          ...(accessKeyId && secretAccessKey && { credentials: { accessKeyId, secretAccessKey } }),
        })
      : null;
  }

  get enabled(): boolean {
    return !!this.client;
  }

  /** Development and tests create their bucket; production's must already exist. */
  async onModuleInit(): Promise<void> {
    if (!this.client || this.config.get('NODE_ENV', { infer: true }) === 'production') return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (error) {
        this.logger.warn(`Object storage unavailable: ${String(error)}`);
      }
    }
  }

  onModuleDestroy(): void {
    this.client?.destroy();
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.require().send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<Readable> {
    const result = await this.require().send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return result.Body as Readable;
  }

  /** Removes objects; ones already gone are fine. */
  async remove(keys: string[]): Promise<void> {
    if (!this.client || keys.length === 0) return;
    for (let start = 0; start < keys.length; start += 1000)
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: keys.slice(start, start + 1000).map((Key) => ({ Key })), Quiet: true },
        }),
      );
  }

  private require(): S3Client {
    if (!this.client) throw new Error('Object storage is not configured (S3_BUCKET)');
    return this.client;
  }
}
