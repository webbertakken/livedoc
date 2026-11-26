import { afterEach, describe, expect, it, vi } from 'vitest';

// The api worker imports this package; a Worker refuses random values, timers and I/O in its global scope, and fails to
// start when a module asks for one as it loads. A Y.Doc draws a random client id as it is made, so none is made then.

let loading = false;
const refuse = (what: string) => {
  if (loading) throw new Error(`${what} while the package loads`);
};

afterEach(() => {
  loading = false;
  vi.doUnmock('yjs');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('the package as it loads', () => {
  it('makes no Y.Doc and draws no random value', async () => {
    vi.resetModules();
    vi.doMock('yjs', async (original) => {
      const yjs = await original<typeof import('yjs')>();
      class Doc extends yjs.Doc {
        constructor(...args: ConstructorParameters<typeof yjs.Doc>) {
          refuse('a Y.Doc made');
          super(...args);
        }
      }
      return { ...yjs, Doc };
    });
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', {
      subtle: real.subtle,
      getRandomValues: <T extends ArrayBufferView>(array: T) => {
        refuse('a random value drawn');
        return real.getRandomValues(array as unknown as Uint8Array) as unknown as T;
      },
      randomUUID: () => {
        refuse('a random id drawn');
        return real.randomUUID();
      },
    });
    loading = true;
    await expect(import('./index')).resolves.toBeDefined();
  });
});
