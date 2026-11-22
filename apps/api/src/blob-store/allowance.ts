// How many bytes one owner's blobs may count (docs/specs/006-document/blob-store.md "Getting bytes in": "Usage is
// checked before the first byte"). The deployment's, set as the gallery's caps are; unset, there is none.
import { blobUsage } from '../db/blobs';
import { parsePositiveCap } from '../positive-cap';
import type { Env } from '../types';

type AllowanceEnv = Pick<Env, 'DB' | 'FILE_MAX_BYTES_PER_OWNER'>;

/** The allowance, or null where the deployment sets none. */
export const filesAllowance = (env: Pick<Env, 'FILE_MAX_BYTES_PER_OWNER'>): number | null =>
  parsePositiveCap(env.FILE_MAX_BYTES_PER_OWNER);

/** What is left of the owner's allowance, never under zero; null where there is no allowance. */
export async function allowanceLeft(env: AllowanceEnv, ownerId: string): Promise<number | null> {
  const allowance = filesAllowance(env);
  if (allowance === null) return null;
  return Math.max(0, allowance - (await blobUsage(env, ownerId)).bytes);
}
