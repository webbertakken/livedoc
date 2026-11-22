// A blob's key (docs/specs/006-document/blob-store.md "Domain language"): the SHA-256 of its bytes as 64 lower-case
// hex characters. Equal bytes are one blob; a tab names its file's bytes by it.

export type BlobKey = string & { readonly __blobKey: unique symbol };

const KEY = /^[0-9a-f]{64}$/;

export function isBlobKey(value: unknown): value is BlobKey {
  return typeof value === 'string' && KEY.test(value);
}

/** The key of some bytes, computed where they are (Web Crypto: a browser, a Worker, Node). */
export async function blobKeyOf(bytes: Uint8Array<ArrayBuffer>): Promise<BlobKey> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  let hex = '';
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
  return hex as BlobKey;
}
