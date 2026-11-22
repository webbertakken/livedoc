// An in-memory `IMAGES` bucket for tests: put with its metadata, head, get, delete of one key or many. Not a
// `.test.ts` file, so vitest doesn't collect it as a suite.
type Held = { bytes: Uint8Array<ArrayBuffer>; customMetadata: Record<string, string> };

export type TestImagesBucket = R2Bucket & { objects: Map<string, Held> };

async function bytesOf(value: unknown): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof value === 'string') return new Uint8Array(new TextEncoder().encode(value));
  if (value instanceof Uint8Array) return new Uint8Array(value);
  return new Uint8Array(await new Response(value as ArrayBuffer).arrayBuffer());
}

export function testImagesBucket(): TestImagesBucket {
  const objects = new Map<string, Held>();
  const read = (key: string) => {
    const held = objects.get(key);
    if (!held) return null;
    return {
      key,
      customMetadata: held.customMetadata,
      arrayBuffer: async () => held.bytes.slice().buffer,
      text: async () => new TextDecoder().decode(held.bytes),
      body: new Response(held.bytes).body,
    };
  };
  const bucket = {
    objects,
    async put(key: string, value: unknown, opts?: R2PutOptions) {
      objects.set(key, { bytes: await bytesOf(value), customMetadata: opts?.customMetadata ?? {} });
      return {};
    },
    head: async (key: string) => read(key),
    get: async (key: string) => read(key),
    async delete(keys: string | string[]) {
      for (const key of [keys].flat()) objects.delete(key);
    },
  };
  return bucket as unknown as TestImagesBucket;
}
