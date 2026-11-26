// @vitest-environment jsdom
// A Drawing's stroke as it is drawn, put for the broadcaster (docs/specs/035-pdf-documents/
// live-editing-and-storage.md "A mark as it is made").
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getLocalPdfDraft, resetPdfDraftsForTests } from './pdf-draft-store';
import { usePdfDraftSend } from './usePdfDraftSend';

const PAGES = [{ name: 'p:1' }, { name: 'p:2' }];
const LOOK = { colour: '#e11d48', opacity: 1, width: 2 };

afterEach(() => {
  resetPdfDraftsForTests();
});

describe('usePdfDraftSend', () => {
  it('puts the stroke on its page by name, one id from its first point to its end', () => {
    const { result } = renderHook(() => usePdfDraftSend({ tabId: 't', pages: PAGES }));
    result.current(1, [1, 2], LOOK);
    const first = getLocalPdfDraft()!;
    expect(first).toMatchObject({ tabId: 't', page: 'p:2', look: LOOK, points: [1, 2] });
    result.current(1, [1, 2, 3, 4], LOOK);
    expect(getLocalPdfDraft()).toMatchObject({ stroke: first.stroke, points: [1, 2, 3, 4] });
    result.current(1, null, LOOK);
    expect(getLocalPdfDraft()).toBeNull();
    result.current(1, [5, 6], LOOK);
    expect(getLocalPdfDraft()!.stroke).not.toBe(first.stroke);
  });

  it('puts nothing for a page it does not have, and takes the stroke back as the surface goes', () => {
    const { result, unmount } = renderHook(() => usePdfDraftSend({ tabId: 't', pages: PAGES }));
    result.current(7, [1, 2], LOOK);
    expect(getLocalPdfDraft()).toBeNull();
    result.current(0, [1, 2], LOOK);
    unmount();
    expect(getLocalPdfDraft()).toBeNull();
  });
});
