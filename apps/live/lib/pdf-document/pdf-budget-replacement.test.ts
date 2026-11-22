// docs/specs/035-pdf-documents/live-editing-and-storage.md "Replacing the stored file": for the budget, an Editor's
// idle surface bakes the live changes into the file, stores it and asks the room.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfReplacementRefusalName } from '@livedoc/api-schema';
import { blobKeyOf, type BlobKey } from '@livedoc/document';
import { Mark, PdfLiveChanges, type BakeResult, type Quad } from '@livedoc/pdf-documents';
import {
  watchPdfBudget,
  type PdfBudgetDeps,
  type PdfBudgetWatch,
  type PdfStoredAsking,
} from './pdf-budget-replacement';

const STORED = 'a'.repeat(64) as BlobKey;
const QUAD: Quad = [72, 716, 300, 716, 72, 700, 300, 700];
const BAKED = Uint8Array.from(new TextEncoder().encode('%PDF-1.7 with an addition'));
const IDLE = 1_000;

const highlight = (id: string) =>
  Mark.highlight({
    id,
    page: 'p:4',
    quads: [QUAD],
    text: 'words',
    colour: '#fdf1a9',
    opacity: 1,
    author: 'Ada',
    createdAt: 1_795_000_000_000,
  })!;

const addition: BakeResult = {
  ok: true,
  bytes: BAKED,
  kind: 'addition',
  anchorsLost: 0,
  fieldsLost: 0,
};

function watching(over: Partial<PdfBudgetDeps> = {}) {
  const doc = PdfLiveChanges.load();
  PdfLiveChanges.addMark(doc, highlight('m1'));
  const refusals = new Set<(refusal: PdfReplacementRefusalName) => void>();
  const deps = {
    tabId: 't1',
    doc,
    storedFile: STORED,
    pages: 3,
    engine: { bake: vi.fn(async (): Promise<BakeResult> => addition) },
    canReplace: vi.fn(() => true),
    isSaved: vi.fn(() => true),
    store: vi.fn(async () => {}),
    ask: vi.fn(async (_asking: PdfStoredAsking) => true),
    onRefused: (listener: (refusal: PdfReplacementRefusalName) => void) => {
      refusals.add(listener);
      return () => refusals.delete(listener);
    },
    // Any change at all is past the budget, unless a test sizes it.
    atBytes: 1,
    idleMs: IDLE,
    ...over,
  };
  const watch = watchPdfBudget(deps);
  watches.push(watch);
  const refuse = (refusal: PdfReplacementRefusalName) =>
    refusals.forEach((listener) => listener(refusal));
  return { doc, deps, stop: watch.stop, refuse, refusals };
}

let watches: PdfBudgetWatch[] = [];

// The wait is the clock's; a bake's key and fingerprint are hashed off it, so each watch is let end what it began.
const wait = (ms = IDLE) => vi.advanceTimersByTimeAsync(ms);
const idle = async (ms = IDLE) => {
  await vi.advanceTimersByTimeAsync(ms);
  await Promise.all(watches.map((watch) => watch.settled()));
};

beforeEach(() => {
  watches = [];
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => void vi.useRealTimers());

describe('watchPdfBudget', () => {
  it('bakes, stores and asks once the surface has been idle with changes past the budget', async () => {
    const { doc, deps } = watching();
    await idle(IDLE - 1);
    expect(deps.engine.bake).not.toHaveBeenCalled();
    await idle(1);
    const update = PdfLiveChanges.encode(doc);
    expect(deps.engine.bake).toHaveBeenCalledWith(update);
    const blob = await blobKeyOf(BAKED);
    expect(deps.store).toHaveBeenCalledWith(blob, BAKED);
    expect(deps.ask).toHaveBeenCalledWith({
      kind: 'pdf-stored',
      tabId: 't1',
      from: STORED,
      blob,
      size: BAKED.byteLength,
      pages: 3,
      reason: 'budget',
      at: await PdfLiveChanges.fingerprint(doc),
    });
  });

  it('waits to be idle again after every change, made here or arrived', async () => {
    const { doc, deps } = watching();
    await idle(IDLE - 1);
    PdfLiveChanges.addMark(doc, highlight('m2'));
    await idle(IDLE - 1);
    expect(deps.engine.bake).not.toHaveBeenCalled();
    await idle(1);
    expect(deps.engine.bake).toHaveBeenCalledTimes(1);
  });

  it('leaves a file under the budget as it is', async () => {
    const { deps } = watching({ atBytes: 1_000_000 });
    await idle();
    expect(deps.engine.bake).not.toHaveBeenCalled();
  });

  it('is an Editor’s alone', async () => {
    const { deps } = watching({ canReplace: () => false });
    await idle();
    expect(deps.engine.bake).not.toHaveBeenCalled();
  });

  it('waits until the room holds what was made here', async () => {
    let saved = false;
    const { deps } = watching({ isSaved: () => saved });
    await idle();
    expect(deps.engine.bake).not.toHaveBeenCalled();
    saved = true;
    await idle();
    expect(deps.engine.bake).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a bake that failed', { ok: false, refusal: 'reopen' }],
    ['a rewrite, which renumbers the file', { ...addition, kind: 'rewrite' }],
    ['a mark the bake could not place', { ...addition, anchorsLost: 1 }],
    ['a field the bake could not fill', { ...addition, fieldsLost: 2 }],
  ] as [string, BakeResult][])('never replaces the stored file with %s', async (_why, baked) => {
    const { deps } = watching({ engine: { bake: vi.fn(async () => baked) } });
    await idle();
    expect(deps.store).not.toHaveBeenCalled();
    expect(deps.ask).not.toHaveBeenCalled();
  });

  it('gives a replacement up when anything changes while it bakes or stores', async () => {
    let bake: (baked: BakeResult) => void = () => {};
    const slow = vi.fn(() => new Promise<BakeResult>((resolve) => (bake = resolve)));
    const baking = watching({ engine: { bake: slow } });
    await wait();
    PdfLiveChanges.addMark(baking.doc, highlight('m2'));
    bake(addition);
    await idle(0);
    expect(baking.deps.store).not.toHaveBeenCalled();
    baking.stop();

    let store: () => void = () => {};
    const storing = watching({ store: vi.fn(() => new Promise<void>((done) => (store = done))) });
    // Baked and keyed, the store is asked: until then nothing is held open.
    await wait();
    await vi.waitFor(() => expect(storing.deps.store).toHaveBeenCalled());
    PdfLiveChanges.addMark(storing.doc, highlight('m2'));
    store();
    await idle(0);
    expect(storing.deps.ask).not.toHaveBeenCalled();
  });

  it('asks nothing when the file cannot be stored', async () => {
    const { deps } = watching({ store: vi.fn(async () => Promise.reject(new Error('full'))) });
    await idle();
    expect(deps.ask).not.toHaveBeenCalled();
  });

  it('tries again once idle when the room held a change the file lacked, and not for another refusal', async () => {
    const { deps, refuse } = watching();
    await idle();
    expect(deps.ask).toHaveBeenCalledTimes(1);
    refuse('stored_file_changed');
    await idle();
    expect(deps.ask).toHaveBeenCalledTimes(1);
    refuse('live_changes_moved');
    await idle();
    expect(deps.ask).toHaveBeenCalledTimes(2);
  });

  it('never bakes twice at once', async () => {
    let bake: (baked: BakeResult) => void = () => {};
    const slow = vi.fn(() => new Promise<BakeResult>((resolve) => (bake = resolve)));
    const { deps, refuse } = watching({ engine: { bake: slow } });
    await wait();
    refuse('live_changes_moved');
    await wait();
    expect(slow).toHaveBeenCalledTimes(1);
    bake(addition);
    await idle(0);
    expect(deps.ask).toHaveBeenCalledTimes(1);
  });

  it('stops watching: no change, refusal or wait replaces anything after', async () => {
    const { doc, deps, stop, refusals } = watching();
    stop();
    PdfLiveChanges.addMark(doc, highlight('m2'));
    await idle(IDLE * 3);
    expect(deps.engine.bake).not.toHaveBeenCalled();
    expect(refusals.size).toBe(0);
  });

  it('gives up a replacement under way when it is stopped', async () => {
    let bake: (baked: BakeResult) => void = () => {};
    const slow = vi.fn(() => new Promise<BakeResult>((resolve) => (bake = resolve)));
    const { deps, stop } = watching({ engine: { bake: slow } });
    await wait();
    stop();
    bake(addition);
    await idle(0);
    expect(deps.store).not.toHaveBeenCalled();
  });
});
