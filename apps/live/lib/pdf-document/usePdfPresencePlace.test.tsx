// @vitest-environment jsdom
// This person's place in a PDF (docs/specs/035-pdf-documents/live-editing-and-storage.md "Presence"): the page in
// view and the mode while the tab is the one they are on, the mark they hold while focus is within the surface.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PdfPresenceMode } from '@livedoc/api-schema';
import { getLocalPdfPresence, resetPdfPresenceForTests } from './pdf-presence-store';
import type { PdfMarksChosen } from './usePdfMarkSelection';
import { usePdfPresencePlace } from './usePdfPresencePlace';

const PAGES = [{ name: 'p:1' }, { name: 'p:2' }];

type Props = {
  present: boolean;
  page: number;
  mode: PdfPresenceMode;
  chosen: PdfMarksChosen | null;
  text?: { page: number; spans: readonly (readonly [number, number])[] } | null;
  reviews?: boolean;
};

function place(initial: Partial<Props> = {}) {
  return renderHook(
    (props: Props) =>
      usePdfPresencePlace({ tabId: 't', pages: PAGES, text: null, reviews: true, ...props }),
    {
      initialProps: { present: true, page: 0, mode: 'reviewing', chosen: null, ...initial },
    },
  );
}

afterEach(() => {
  resetPdfPresenceForTests();
});

describe('usePdfPresencePlace', () => {
  it('says the page in view and the mode, holding nothing', () => {
    const { rerender } = place();
    expect(getLocalPdfPresence()).toEqual({
      tabId: 't',
      page: 'p:1',
      mode: 'reviewing',
      held: null,
    });
    rerender({ present: true, page: 1, mode: 'editing', chosen: null });
    expect(getLocalPdfPresence()).toMatchObject({ page: 'p:2', mode: 'editing' });
  });

  it('holds the first mark selected while focus is within the surface, and lets it go as focus leaves', () => {
    const chosen = { page: 0, ids: ['m2', 'm1'] };
    const { result } = place({ chosen });
    expect(getLocalPdfPresence()?.held).toBeNull();
    act(() => result.current.onFocus());
    expect(getLocalPdfPresence()?.held).toEqual({ what: 'mark', name: 'm2' });
    act(() => result.current.onBlur());
    expect(getLocalPdfPresence()?.held).toBeNull();
  });

  it('holds the text selected, on its page by name, and nothing for a Viewer', () => {
    const text = { page: 1, spans: [[3, 8]] as const };
    const { result, rerender } = place({ text });
    act(() => result.current.onFocus());
    expect(getLocalPdfPresence()?.held).toEqual({ what: 'text', page: 'p:2', first: 3, last: 7 });
    rerender({ present: true, page: 0, mode: 'viewing', chosen: null, text, reviews: false });
    expect(getLocalPdfPresence()?.held).toBeNull();
  });

  it('keeps holding as focus moves within the surface, a blur then a focus', () => {
    const { result } = place({ chosen: { page: 0, ids: ['m1'] } });
    act(() => {
      result.current.onFocus();
      result.current.onBlur();
      result.current.onFocus();
    });
    expect(getLocalPdfPresence()?.held).toEqual({ what: 'mark', name: 'm1' });
  });

  it('takes the place back on leaving the tab, and says nothing for a pane that is not the one the person is on', () => {
    const { rerender } = place();
    rerender({ present: false, page: 0, mode: 'reviewing', chosen: null });
    expect(getLocalPdfPresence()).toBeNull();
    const other = place({ present: false });
    expect(getLocalPdfPresence()).toBeNull();
    other.unmount();
  });
});
