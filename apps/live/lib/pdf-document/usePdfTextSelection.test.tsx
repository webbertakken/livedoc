// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "The pages": Selecting text: a drag selects by character between
// caret places, Shift extends, Alt selects a column, a double press a word and a triple a line; a press without a
// drag clears; Select all is a page's text; a change of the pages clears; the text copied is the selection's.
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageName, PageText, type PageInfo } from '@livedoc/pdf-documents';
import { usePdfTextSelection } from './usePdfTextSelection';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

// "Hello world" on page one, each character 6 points wide from x 100, 8 tall from y 700, then a generated break and
// "Bye" on the line below; page two has no text.
const TEXT = 'Hello world\r\nBye';
const boxes = [...TEXT].flatMap((character, at) => {
  if (character === ' ' || character === '\r' || character === '\n') return [0, 0, 0, 0];
  return at < 11
    ? [100 + at * 6, 700, 106 + at * 6, 708]
    : [100 + (at - 13) * 6, 688, 106 + (at - 13) * 6, 696];
});
const PAGE_ONE = PageText.of(
  [...TEXT].map((c) => c.codePointAt(0)!),
  boxes,
);

const pagesOf = (count: number): PageInfo[] =>
  Array.from({ length: count }, (_, at) => ({
    name: PageName.ofObject(at + 3),
    width: 612,
    height: 792,
    rotation: 0,
    label: null,
  }));

function selection(pages = pagesOf(2)) {
  const pageText = vi.fn(async (index: number) => (index === 0 ? PAGE_ONE : PageText.of([], [])));
  const engine = { pageText, pageTags: async () => null };
  const hook = renderHook(({ pages: shown }) => usePdfTextSelection(engine, shown), {
    initialProps: { pages },
  });
  return { hook, pageText };
}

const at = (x: number, y = 704) => ({ x, y });

describe('selecting a page’s text', () => {
  it('selects by character between where a drag starts and where it is', async () => {
    const { hook } = selection();
    act(() => {
      hook.result.current.gesture(0, { kind: 'press', at: at(101), shift: false, alt: false });
      hook.result.current.gesture(0, { kind: 'drag', at: at(128) });
    });
    await waitFor(() => expect(hook.result.current.selected?.text).toBe('Hello'));
    expect(hook.result.current.selected).toMatchObject({ page: 0, spans: [[0, 5]] });
    expect(hook.result.current.selected?.quads).toEqual([[100, 708, 130, 708, 100, 700, 130, 700]]);
    // Dragged back past where it started: the selection runs the other way.
    act(() => hook.result.current.gesture(0, { kind: 'drag', at: at(90, 692) }));
    await waitFor(() => expect(hook.result.current.selected?.spans).toEqual([[0, 13]]));
  });

  it('clears the selection on a press without a drag, and on clear', async () => {
    const { hook } = selection();
    act(() => {
      hook.result.current.gesture(0, { kind: 'press', at: at(101), shift: false, alt: false });
      hook.result.current.gesture(0, { kind: 'drag', at: at(128) });
    });
    await waitFor(() => expect(hook.result.current.selected).not.toBeNull());
    act(() =>
      hook.result.current.gesture(0, { kind: 'press', at: at(140), shift: false, alt: false }),
    );
    await waitFor(() => expect(hook.result.current.selected).toBeNull());
    act(() => hook.result.current.selectAll(0));
    await waitFor(() => expect(hook.result.current.selected).not.toBeNull());
    act(() => hook.result.current.clear());
    expect(hook.result.current.selected).toBeNull();
  });

  it('extends from where the selection started with Shift', async () => {
    const { hook } = selection();
    act(() => {
      hook.result.current.gesture(0, { kind: 'press', at: at(101), shift: false, alt: false });
      hook.result.current.gesture(0, { kind: 'drag', at: at(128) });
      hook.result.current.gesture(0, { kind: 'press', at: at(165), shift: true, alt: false });
    });
    await waitFor(() => expect(hook.result.current.selected?.text).toBe('Hello world'));
  });

  it('starts anew where Shift is held on another page or with nothing selected', async () => {
    const { hook } = selection();
    act(() => {
      hook.result.current.gesture(0, { kind: 'press', at: at(165), shift: true, alt: false });
      hook.result.current.gesture(0, { kind: 'drag', at: at(101) });
    });
    await waitFor(() => expect(hook.result.current.selected?.text).toBe('Hello world'));
  });

  it('selects a column with Alt', async () => {
    const { hook } = selection();
    act(() => {
      hook.result.current.gesture(0, { kind: 'press', at: at(99, 710), shift: false, alt: true });
      hook.result.current.gesture(0, { kind: 'drag', at: at(113, 690) });
    });
    await waitFor(() => expect(hook.result.current.selected?.text).toBe('He\nBy'));
  });

  it('selects a word on a double press and a line on a triple', async () => {
    const { hook } = selection();
    act(() => hook.result.current.gesture(0, { kind: 'presses', at: at(140), count: 2 }));
    await waitFor(() => expect(hook.result.current.selected?.text).toBe('world'));
    act(() => hook.result.current.gesture(0, { kind: 'presses', at: at(140), count: 3 }));
    await waitFor(() => expect(hook.result.current.selected?.text).toBe('Hello world'));
    // One press is the drag's: it changes nothing here.
    act(() => hook.result.current.gesture(0, { kind: 'presses', at: at(101), count: 1 }));
    await waitFor(() => expect(hook.result.current.selected?.text).toBe('Hello world'));
  });

  it('selects all of a page’s text', async () => {
    const { hook } = selection();
    act(() => hook.result.current.selectAll(0));
    await waitFor(() => expect(hook.result.current.selected?.text).toBe('Hello world Bye'));
  });

  it('selects nothing on a page with no text', async () => {
    const { hook, pageText } = selection();
    act(() => {
      hook.result.current.selectAll(1);
      hook.result.current.gesture(1, { kind: 'press', at: at(1), shift: false, alt: false });
      hook.result.current.gesture(1, { kind: 'drag', at: at(9) });
      hook.result.current.gesture(1, { kind: 'presses', at: at(1), count: 2 });
    });
    await waitFor(() => expect(pageText).toHaveBeenCalledWith(1));
    expect(hook.result.current.selected).toBeNull();
  });

  it('ignores a drag with no press before it', async () => {
    const { hook, pageText } = selection();
    act(() => hook.result.current.gesture(0, { kind: 'drag', at: at(128) }));
    await act(async () => {});
    expect(pageText).not.toHaveBeenCalled();
    expect(hook.result.current.selected).toBeNull();
  });

  it('clears the selection and reads again when the pages change', async () => {
    const { hook, pageText } = selection();
    act(() => hook.result.current.selectAll(0));
    await waitFor(() => expect(hook.result.current.selected).not.toBeNull());
    hook.rerender({ pages: pagesOf(3) });
    expect(hook.result.current.selected).toBeNull();
    act(() => hook.result.current.selectAll(0));
    await waitFor(() => expect(hook.result.current.selected).not.toBeNull());
    expect(pageText).toHaveBeenCalledTimes(2);
  });

  it('drops what a page answers after the pages changed', async () => {
    const { hook } = selection();
    act(() => hook.result.current.selectAll(0));
    hook.rerender({ pages: pagesOf(3) });
    await act(async () => {});
    expect(hook.result.current.selected).toBeNull();
  });
});

describe('selecting with nothing to select from', () => {
  it('does nothing before the engine and the pages are there', async () => {
    const hook = renderHook(() => usePdfTextSelection(null, null));
    act(() => {
      hook.result.current.selectAll(0);
      hook.result.current.gesture(0, { kind: 'presses', at: { x: 1, y: 1 }, count: 2 });
    });
    await act(async () => {});
    expect(hook.result.current.selected).toBeNull();
  });

  it('selects nothing on a page the engine answers no text for', async () => {
    const pageText = vi.fn(async () => null);
    const hook = renderHook(() =>
      usePdfTextSelection({ pageText, pageTags: async () => null }, pagesOf(1)),
    );
    act(() => hook.result.current.selectAll(0));
    await waitFor(() => expect(pageText).toHaveBeenCalled());
    expect(hook.result.current.selected).toBeNull();
  });
});
