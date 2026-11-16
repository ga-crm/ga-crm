import type { ValueTransformer } from 'typeorm';

/**
 * bigint columns (VND amounts) come back from PostgreSQL as strings. Amounts stay well below
 * 2^53, so they are safe as JavaScript numbers.
 */
export const bigintNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};
