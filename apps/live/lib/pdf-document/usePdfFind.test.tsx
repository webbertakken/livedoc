// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Find": Find opens the field; a query is searched once it rests,
// a newer one stopping the one before; the first result is current and gone to; Next and Previous step round the
// ends; a result is gone to as a jump, its match two lines below the view's top, a bookmark followed; the count; the
// tints; Escape's close takes them away; counted and logged.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PageName,
  PageText,
  PDF_FIND_SETTLE_MS,
  type FileMark,
  type PageInfo,
  type PageMatrix,
} from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { FIND } from './pdf-menus';
import { FIND_NEXT, FIND_PREVIOUS } from './pdf-shortcuts';
import { pdfFindCount, usePdfFind } from './usePdfFind';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const UPRIGHT: PageMatrix = [1, 0, 0, -1, 0, 792];
const PAGES: PageInfo[] = [3, 5].map((n) => ({
  name: PageName.ofObject(n),
  width: 612,
  height: 792,
  rotation: 0,
  label: null,
}));
// "fox" on both pages, on a line 8 points tall from 400 up.
const textOf = (text: string) =>
  PageText.of(
    [...text].map((c) => c.codePointAt(0)!),
    [...text].flatMap((_, at) => [at * 6, 400, at * 6 + 6, 408]),
  );
const TEXTS = ['a fox', 'fox b'];

function find() {
  const jump = vi.fn();
  const follow = vi.fn();
  const engine = {
    pageText: vi.fn(async (index: number) => textOf(TEXTS[index]!)),
    fileMarks: vi.fn(async (): Promise<readonly FileMark[]> => []),
    outline: vi.fn(async () => ({
      items: [{ title: 'fox', depth: 0, target: null }],
      cut: false,
    })),
    pageMatrix: vi.fn(async (): Promise<PageMatrix | null> => UPRIGHT),
  };
  const hook = renderHook(() => usePdfFind({ engine, pages: PAGES, turns: 0, jump, follow }));
  return { hook, jump, follow, engine };
}

// Lets the query rest and the search run to its end.
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(PDF_FIND_SETTLE_MS);
  });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('finding in a PDF', () => {
  it('opens on Find and searches a query once it rests, going to the first result', async () => {
    const { hook, jump } = find();
    expect(hook.result.current.open).toBe(false);
    act(() => hook.result.current.actions[FIND]!.run());
    expect(hook.result.current.open).toBe(true);
    expect(hook.result.current.focusNonce).toBe(1);
    act(() => hook.result.current.ask('fox'));
    await settle();
    expect(track).toHaveBeenCalledWith('Pdf', 'Searched', 'Find');
    expect(debugLog).toHaveBeenCalledWith('[pdf] find-searched pages=2 results=2');
    expect(hook.result.current.count).toBe('1 of 2');
    expect(hook.result.current.current).toBe(0);
    // The match is 400 to 408 up page one: its top, two lines higher, is 792 - 424 = 368 down.
    expect(jump).toHaveBeenLastCalledWith(0, { across: 0, down: 368 / 792 });
    expect(hook.result.current.tints.get(0)?.current).toHaveLength(1);
    expect(hook.result.current.tints.get(1)?.found).toHaveLength(1);
  });

  it('steps through the results round the ends, by the actions too', async () => {
    const { hook, jump } = find();
    act(() => hook.result.current.actions[FIND]!.run());
    act(() => hook.result.current.ask('fox'));
    await settle();
    await act(async () => hook.result.current.actions[FIND_NEXT]!.run());
    expect(hook.result.current.current).toBe(1);
    expect(jump).toHaveBeenLastCalledWith(1, expect.anything());
    await act(async () => hook.result.current.step(1));
    expect(hook.result.current.current).toBe(0);
    await act(async () => hook.result.current.actions[FIND_PREVIOUS]!.run());
    expect(hook.result.current.current).toBe(1);
    await act(async () => hook.result.current.choose(0));
    expect(hook.result.current.current).toBe(0);
    act(() => hook.result.current.choose(9));
    expect(hook.result.current.current).toBe(0);
  });

  it('follows a bookmark found, and searches again when an option changes', async () => {
    const { hook, follow, engine } = find();
    act(() => hook.result.current.actions[FIND]!.run());
    act(() => hook.result.current.ask('fox'));
    act(() => hook.result.current.setOption('bookmarks', true));
    expect(hook.result.current.options.bookmarks).toBe(true);
    await settle();
    expect(engine.outline).toHaveBeenCalled();
    expect(follow).toHaveBeenCalledWith(null);
    expect(hook.result.current.count).toBe('1 of 3');
  });

  it('stops a search when a newer query begins', async () => {
    const { hook, engine } = find();
    act(() => hook.result.current.actions[FIND]!.run());
    act(() => hook.result.current.ask('fox'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PDF_FIND_SETTLE_MS - 1);
    });
    act(() => hook.result.current.ask('b'));
    await settle();
    expect(engine.pageText).toHaveBeenCalledTimes(2);
    expect(hook.result.current.count).toBe('1 of 1');
  });

  it('binds no step without results, and closes, taking the results away', async () => {
    const { hook } = find();
    act(() => hook.result.current.actions[FIND]!.run());
    expect(hook.result.current.actions[FIND_NEXT]).toBeUndefined();
    act(() => hook.result.current.step(1));
    act(() => hook.result.current.ask('fox'));
    await settle();
    act(() => hook.result.current.setListOpen(true));
    act(() => hook.result.current.close());
    expect(hook.result.current).toMatchObject({
      open: false,
      listOpen: false,
      progress: null,
      count: '',
    });
    expect(hook.result.current.tints.size).toBe(0);
  });

  it('goes to a result’s page where its matrix cannot be read', async () => {
    const { hook, jump, engine } = find();
    engine.pageMatrix.mockResolvedValue(null);
    act(() => hook.result.current.actions[FIND]!.run());
    act(() => hook.result.current.ask('fox'));
    await settle();
    expect(jump).toHaveBeenLastCalledWith(0, undefined);
  });

  it('searches nothing for an empty query', async () => {
    const { hook, engine } = find();
    act(() => hook.result.current.actions[FIND]!.run());
    act(() => hook.result.current.ask('  '));
    await settle();
    expect(engine.pageText).not.toHaveBeenCalled();
  });
});

describe('finding before the engine is there', () => {
  it('searches nothing', async () => {
    const hook = renderHook(() =>
      usePdfFind({ engine: null, pages: PAGES, turns: 0, jump: vi.fn(), follow: vi.fn() }),
    );
    act(() => hook.result.current.actions[FIND]!.run());
    act(() => hook.result.current.ask('fox'));
    await settle();
    expect(hook.result.current.progress).toBeNull();
  });
});

describe('what the count says', () => {
  const result = {
    kind: 'text' as const,
    page: 0,
    span: [0, 1] as const,
    quads: [],
    snippet: { before: '', match: 'a', after: '' },
  };

  it('says the search under way, none found, the place among many, and more than it lists', () => {
    expect(pdfFindCount(null, null, 400)).toBe('');
    expect(pdfFindCount({ results: [], total: 0, searched: 120 }, null, 400)).toBe(
      'Searching 120 of 400 pages…',
    );
    expect(pdfFindCount({ results: [], total: 0, searched: 400 }, null, 400)).toBe('No results');
    expect(pdfFindCount({ results: [result], total: 41, searched: 2 }, 0, 2)).toBe('1 of 1+');
    expect(pdfFindCount({ results: [result, result], total: 2, searched: 2 }, 1, 2)).toBe('2 of 2');
    expect(pdfFindCount({ results: [result], total: 1, searched: 2 }, null, 2)).toBe('1 of 1');
  });
});
