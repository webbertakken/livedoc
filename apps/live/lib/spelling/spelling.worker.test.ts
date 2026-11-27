import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpellingRequest, SpellingResponse } from './spelling-protocol';

// docs/specs/034-text-documents/tools.md "Spelling and grammar": the worker's side, with the real Dutch files.
async function startWorker(fetchFile: (url: URL) => Promise<Response>) {
  const posted: SpellingResponse[] = [];
  let onMessage: (e: { data: SpellingRequest }) => void = () => {};
  vi.stubGlobal('self', {
    postMessage: (message: SpellingResponse) => posted.push(message),
    addEventListener: (_: 'message', fn: typeof onMessage) => (onMessage = fn),
  });
  vi.stubGlobal('fetch', fetchFile);
  vi.resetModules();
  await import('./spelling.worker');
  const send = async (data: SpellingRequest) => {
    const before = posted.length;
    onMessage({ data });
    await vi.waitFor(() => expect(posted.length).toBe(before + 1));
    return posted.at(-1)!;
  };
  return { send };
}
const fromDisk = (url: URL) => Promise.resolve(new Response(readFileSync(fileURLToPath(url))));

afterEach(() => vi.unstubAllGlobals());

describe('the spelling worker', () => {
  it('answers checks and suggestions from the fetched dictionary', async () => {
    const { send } = await startWorker(fromDisk);
    expect(await send({ id: 1, kind: 'check', language: 'nl', words: ['huis', 'hius'] })).toEqual({
      id: 1,
      kind: 'checked',
      misspelt: ['hius'],
    });
    expect(await send({ id: 2, kind: 'suggest', language: 'nl', word: 'hius', most: 1 })).toEqual({
      id: 2,
      kind: 'suggested',
      suggestions: ['huis'],
    });
  });

  it('answers a correction it is sure of', async () => {
    const { send } = await startWorker(fromDisk);
    expect(await send({ id: 4, kind: 'correct', language: 'nl', word: 'hius' })).toEqual({
      id: 4,
      kind: 'corrected',
      correction: 'huis',
    });
  });

  it('says a dictionary failed to load, with the language', async () => {
    const { send } = await startWorker(() => Promise.resolve(new Response('', { status: 404 })));
    expect(
      await send({ id: 3, kind: 'suggest', language: 'fr', word: 'x', most: 1 }),
    ).toMatchObject({
      id: 3,
      kind: 'failed',
      error: 'load-failed',
      detail: expect.stringContaining('fr:') as string,
    });
  });
});
