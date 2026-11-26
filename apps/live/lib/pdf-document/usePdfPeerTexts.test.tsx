// @vitest-environment jsdom
// Collaborators' text selections drawn from the page's own text (docs/specs/035-pdf-documents/
// live-editing-and-storage.md "Presence").
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageText, TextRange } from '@livedoc/pdf-documents';
import type { PdfPageTexts } from './pdf-page-texts';
import type { PdfPeerText } from './pdf-presence-held';
import { peerTextQuads, usePdfPeerTexts } from './usePdfPeerTexts';

// "Hello": five characters in a row, ten points each.
const HELLO = PageText.of(
  [...'Hello'].map((c) => c.codePointAt(0)!),
  [...'Hello'].flatMap((_, at) => [at * 10, 0, at * 10 + 10, 12]),
);

const pageTexts = (): PdfPageTexts => ({
  read: vi.fn(async () => HELLO),
  tags: vi.fn(async () => null),
});

const BO: PdfPeerText = { id: 'bo', name: 'Bo', color: '#2563eb', first: 1, last: 3 };

describe('peerTextQuads', () => {
  it('draws the characters from first to last', () => {
    expect(peerTextQuads(HELLO, 1, 3)).toEqual(TextRange.quads(HELLO, [[1, 4]]));
  });

  it('cuts a range past the page\u2019s text, and draws none wholly past it', () => {
    expect(peerTextQuads(HELLO, 3, 99)).toEqual(TextRange.quads(HELLO, [[3, 5]]));
    expect(peerTextQuads(HELLO, 7, 9)).toEqual([]);
  });
});

describe('usePdfPeerTexts', () => {
  it('reads the page\u2019s text once someone holds text on it, and draws each selection', async () => {
    const texts = pageTexts();
    const { result, rerender } = renderHook(
      ({ held }: { held: readonly PdfPeerText[] }) => usePdfPeerTexts(2, texts, held),
      { initialProps: { held: [] as readonly PdfPeerText[] } },
    );
    expect(result.current).toEqual([]);
    expect(texts.read).not.toHaveBeenCalled();
    rerender({ held: [BO] });
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(texts.read).toHaveBeenCalledWith(2);
    expect(result.current[0]).toEqual({
      id: 'bo',
      name: 'Bo',
      color: '#2563eb',
      quads: TextRange.quads(HELLO, [[1, 4]]),
    });
    rerender({ held: [{ ...BO, first: 0 }] });
    expect(result.current[0]!.quads).toEqual(TextRange.quads(HELLO, [[0, 4]]));
    expect(texts.read).toHaveBeenCalledTimes(1);
  });

  it('draws nothing for a page whose text cannot be read, or with no texts', async () => {
    const texts: PdfPageTexts = { read: vi.fn(async () => null), tags: vi.fn(async () => null) };
    const { result } = renderHook(() => usePdfPeerTexts(0, texts, [BO]));
    await waitFor(() => expect(texts.read).toHaveBeenCalled());
    expect(result.current).toEqual([]);
    expect(renderHook(() => usePdfPeerTexts(0, null, [BO])).result.current).toEqual([]);
  });
});
