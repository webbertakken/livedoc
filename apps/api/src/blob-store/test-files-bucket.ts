// An in-memory `FILES` bucket for tests: put (checking the SHA-256 it is given, as object storage does), head, get
// by range, delete, and uploads in parts. Not a `.test.ts` file, so vitest doesn't collect it as a suite.
import { createHash } from 'node:crypto';

export type TestFilesBucket = R2Bucket & {
  objects: Map<string, Uint8Array>;
  /** The bytes of the one object stored for that owner under that key, whatever its mark; undefined for none. */
  blob(ownerId: string, key: string): Uint8Array | undefined;
  /** Uploads in parts that are neither completed nor aborted, by object storage's id: their parts by number. */
  uploads: Map<string, Map<number, Uint8Array>>;
  failPuts: boolean;
  failParts: boolean;
};

async function bytesOf(value: unknown): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(await new Response(value as ReadableStream).arrayBuffer());
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const whole = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let at = 0;
  for (const part of parts) {
    whole.set(part, at);
    at += part.byteLength;
  }
  return whole;
}

export function testFilesBucket(): TestFilesBucket {
  const objects = new Map<string, Uint8Array>();
  const uploads = new Map<string, Map<number, Uint8Array>>();
  let nextUpload = 1;

  const multipart = (name: string, uploadId: string) => ({
    key: name,
    uploadId,
    async uploadPart(partNumber: number, value: unknown) {
      const bytes = await bytesOf(value);
      const parts = uploads.get(uploadId);
      if (bucket.failParts) throw new Error('uploadPart: internal error (10001)');
      if (!parts)
        throw new Error('uploadPart: The specified multipart upload does not exist. (10024)');
      parts.set(partNumber, bytes);
      return { partNumber, etag: `etag-${uploadId}-${partNumber}-${bytes.byteLength}` };
    },
    async abort() {
      if (!uploads.delete(uploadId))
        throw new Error('abort: The specified multipart upload does not exist. (10024)');
    },
    async complete(given: { partNumber: number; etag: string }[]) {
      const parts = uploads.get(uploadId);
      if (!parts)
        throw new Error('complete: The specified multipart upload does not exist. (10024)');
      const whole = given.map(({ partNumber, etag }) => {
        const bytes = parts.get(partNumber);
        if (!bytes || etag !== `etag-${uploadId}-${partNumber}-${bytes.byteLength}`)
          throw new Error(
            'complete: One or more of the specified parts could not be found. (10025)',
          );
        return bytes;
      });
      uploads.delete(uploadId);
      objects.set(name, concat(whole));
      return {} as R2Object;
    },
  });

  const bucket = {
    objects,
    uploads,
    failPuts: false,
    failParts: false,
    blob(ownerId: string, key: string) {
      const names = [...objects.keys()].filter((name) => name.startsWith(`${ownerId}/${key}.`));
      return names.length === 1 ? objects.get(names[0]!) : undefined;
    },
    async put(name: string, value: unknown, opts?: R2PutOptions) {
      const bytes = await bytesOf(value);
      if (bucket.failPuts) throw new Error('put: internal error (10001)');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (typeof opts?.sha256 === 'string' && opts.sha256 !== sha256)
        throw new Error(
          'put: The SHA-256 checksum you specified did not match what we received. (10037)',
        );
      objects.set(name, bytes);
      return {} as R2Object;
    },
    async head(name: string) {
      const hit = objects.get(name);
      return hit ? ({ key: name, size: hit.byteLength } as R2Object) : null;
    },
    async get(name: string, opts?: R2GetOptions) {
      const hit = objects.get(name);
      if (!hit) return null;
      const range = opts?.range as { offset?: number; length?: number } | undefined;
      const offset = range?.offset ?? 0;
      const bytes = hit.slice(offset, offset + (range?.length ?? hit.byteLength));
      return { body: new Blob([bytes]).stream(), size: hit.byteLength } as unknown as R2ObjectBody;
    },
    async delete(names: string | string[]) {
      for (const name of [names].flat()) objects.delete(name);
    },
    async createMultipartUpload(name: string) {
      const uploadId = `r2-upload-${nextUpload++}`;
      uploads.set(uploadId, new Map());
      return multipart(name, uploadId);
    },
    resumeMultipartUpload: (name: string, uploadId: string) => multipart(name, uploadId),
  };
  return bucket as unknown as TestFilesBucket;
}
