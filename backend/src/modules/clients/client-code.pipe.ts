import { Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { notFound } from '../../common/errors.js';
import { CLIENT_CODE } from './client.constants.js';

/** DATA-1: a client code is exactly 10 digits; anything else names no client (404). */
@Injectable()
export class ClientCodePipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!CLIENT_CODE.test(value)) throw notFound();
    return value;
  }
}
