// @vitest-environment jsdom
// docs/specs/035-pdf-documents/live-editing-and-storage.md "A browser's thumbnail": which open surface sends one.
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { AccessLevel } from '@livedoc/api-schema';
import type { Mark, PageInfo } from '@livedoc/pdf-documents';
import type { PdfHome } from './pdf-home';
import type { PdfThumbnailDeps } from './pdf-thumbnail';
import type { PdfDocumentOpen } from './usePdfDocument';
import { usePdfThumbnail } from './usePdfThumbnail';

const watch = vi.hoisted(() => ({ stop: vi.fn(), made: [] as unknown[] }));
vi.mock('./pdf-thumbnail', () => ({
  watchPdfThumbnail: (deps: unknown) => {
    watch.made.push(deps);
    return { stop: watch.stop, settled: async () => {} };
  },
}));
const api = vi.hoisted(() => ({
  apiPdfThumbnailWanted: vi.fn(async () => true),
  apiSendPdfThumbnail: vi.fn(async () => {}),
}));
vi.mock('@/lib/api/pdf-documents', () => api);
const cache = vi.hoisted(() => ({ forgetThumbnailsOf: vi.fn() }));
vi.mock('@/lib/thumbnail-cache', () => cache);
vi.mock('./pdf-thumbnail-canvas', () => ({ encodePdfThumbnail: vi.fn() }));

const FIRST = { name: 'p:1', width: 612, height: 792, rotation: 0, label: null } as PageInfo;
const MARK = { id: 'm1', page: 'p:1' } as unknown as Mark;
const scope = { ownerId: 'ada', documentId: 'D', tabId: 't1', shareCode: null };
const marks = { get: () => new Map([[FIRST.name, [MARK]]]), subscribe: () => () => {} };
const ready = (over: Partial<PdfDocumentOpen & { phase: 'ready' }> = {}) =>
  ({
    phase: 'ready',
    pages: [FIRST],
    protected: false,
    engine: { drawPage: vi.fn() },
    binding: { doc: new Y.Doc(), isSaved: () => true },
    ...over,
  }) as unknown as PdfDocumentOpen & { phase: 'ready' };

const open = (
  now: (PdfDocumentOpen & { phase: 'ready' }) | null,
  home: PdfHome = 'room',
  level: AccessLevel = 'edit',
) =>
  renderHook(({ at }) => usePdfThumbnail(now, now ? marks : null, scope, home, at), {
    initialProps: { at: level },
  });
const made = () => watch.made as PdfThumbnailDeps[];

beforeEach(() => {
  watch.made.length = 0;
  vi.clearAllMocks();
});

describe('an open PDF surface and its document’s thumbnail', () => {
  it('watches for one once the PDF is ready, with the first page and the live marks on it', async () => {
    const now = ready();
    const view = open(now);
    expect(made()).toHaveLength(1);
    const deps = made()[0]!;
    expect(deps.page).toBe(FIRST);
    expect(deps.marks()).toEqual([MARK]);
    expect(deps.doc).toBe(now.binding.doc);
    await deps.wanted();
    expect(api.apiPdfThumbnailWanted).toHaveBeenCalledWith(scope);
    const jpeg = new Uint8Array(3);
    await deps.send(jpeg);
    expect(api.apiSendPdfThumbnail).toHaveBeenCalledWith(scope, jpeg);
    // What this browser kept of the earlier picture is out of date.
    deps.onSent?.();
    expect(cache.forgetThumbnailsOf).toHaveBeenCalledWith('D');
    view.unmount();
    expect(watch.stop).toHaveBeenCalledTimes(1);
  });

  // "Who sends one: an Editor's open surface"
  it.each([
    ['edit', true],
    ['participate', false],
    ['view', false],
  ] as const)('lets a session at %s send: %s', (level, sends) => {
    open(ready(), 'room', level);
    expect(made()[0]!.canSend()).toBe(sends);
  });

  it('reads the level as it is when a picture is about to be sent', () => {
    const view = open(ready());
    view.rerender({ at: 'view' });
    expect(made()).toHaveLength(1);
    expect(made()[0]!.canSend()).toBe(false);
  });

  // "Never of a file opened with a password ..., nor of a This Browser document"
  it.each([
    ['a PDF still opening', null, 'room'],
    ['a This Browser document', ready(), 'this-browser'],
    ['a protected file', ready({ protected: true }), 'room'],
    ['a PDF with no page', ready({ pages: [] }), 'room'],
  ] as const)('watches for none of %s', (_what, now, home) => {
    open(now, home);
    expect(made()).toEqual([]);
  });
});
