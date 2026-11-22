// An in-memory `FILES` bucket for tests: put (checking the SHA-256 it is given, as object storage does), head and
// get by range. Not a `.test.ts` file, so vitest doesn't collect it as a suite.
import { createHash } from 'node:crypto';

export type TestFilesBucket = R2Bucket & { objects: Map<string, Uint8Array>; failPuts: boolean };

async function bytesOf(value: unknown): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(await new Response(value as ReadableStream).arrayBuffer());
}

export function testFilesBucket(): TestFilesBucket {
  const objects = new Map<string, Uint8Array>();
  const bucket = {
    objects,
    failPuts: false,
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
  };
  return bucket as unknown as TestFilesBucket;
}
