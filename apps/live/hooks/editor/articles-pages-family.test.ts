// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createShape,
  layOutPages,
  pagesOf,
  type ArticleBlock,
  type EditorMode,
  type Tab,
} from '@livedoc/document';
import { useArticleIntake } from './useArticleIntake';
import { useArticles } from './useArticles';
import { useLeavePages } from './useLeavePages';

// docs/specs/016-platform/web-performance.md "An element kind's code loads with the board that holds it": an
// article's writing, its intake and turning it into pages are the pages family's. Before the family is in, the
// writing is not drawn and nothing of it runs; it asks for the family, and runs once it lands.

// The family's store, held by the test: in or not, and whether a load succeeds.
const family = vi.hoisted(() => ({
  loaded: false,
  outcome: true,
  asked: [] as [string, string][],
  listeners: new Set<() => void>(),
}));
vi.mock('@/lib/element-kinds/store', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/element-kinds/store')>();
  const land = async () => {
    await real.loadKindFamily('pages-articles', 'element');
    family.loaded = true;
    for (const listener of family.listeners) listener();
  };
  return {
    ...real,
    isKindFamilyLoaded: () => family.loaded,
    subscribeKindFamilies: (listener: () => void) => {
      family.listeners.add(listener);
      return () => family.listeners.delete(listener);
    },
    loadKindFamily: async (id: string, reason: string) => {
      family.asked.push([id, reason]);
      if (family.outcome) await land();
      return family.outcome;
    },
    requireKindFamily: (id: 'pages-articles') => {
      if (!family.loaded) throw new real.KindFamilyNotLoaded(id);
      return real.requireKindFamily(id);
    },
  };
});
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
const handle = vi.hoisted(() => ({
  insertZone: vi.fn(),
  moveZone: vi.fn(),
  takeBlocks: vi.fn(() => [] as ArticleBlock[]),
  blocksByPage: vi.fn(() => [['p']]),
}));
vi.mock('@/lib/article/article-editor-store', () => ({
  articleHandleOf: () => handle,
  markZoneReleased: vi.fn(),
  takeZoneReleased: () => false,
  forgetZonesReleased: vi.fn(),
}));

const blocks: ArticleBlock[] = [{ id: 'p', type: 'paragraph', runs: [{ text: 'Hello' }] }];
const articleTab = (): Tab =>
  ({
    id: 't',
    name: 'Tab',
    elements: [],
    opensIn: 'pages',
    pages: [{ id: 'a1', orientation: 'portrait', kind: 'article', flow: 'a' }],
    articles: { a: { blocks } },
  }) as unknown as Tab;

beforeEach(() => {
  family.loaded = false;
  family.outcome = true;
  family.asked.length = 0;
  family.listeners.clear();
  handle.insertZone.mockReset();
});

const articlesDeps = (tab: Tab) => ({
  activeTab: tab,
  on: true,
  pages: null,
  localEditSeq: { current: 0 },
  placeAt: vi.fn(),
  canEdit: true,
  commitTabs: vi.fn(),
  tickTabs: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  clearSelection: vi.fn(),
  openNote: vi.fn(),
  reveal: vi.fn(),
});

describe('useArticles before the pages family is in', () => {
  it('draws no writing, asks for the family, and draws it once it lands', async () => {
    const { result } = renderHook(() => useArticles(articlesDeps(articleTab())));
    expect(family.asked).toEqual([['pages-articles', 'element']]);
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(Object.keys(result.current!.flows)).toEqual(['a']);
  });

  it('asks for nothing on a tab without articles', () => {
    const tab = { ...articleTab(), articles: undefined } as Tab;
    const { result } = renderHook(() => useArticles(articlesDeps(tab)));
    expect(result.current).toBeNull();
    expect(family.asked).toEqual([]);
  });
});

describe('useArticleIntake before the pages family is in', () => {
  it('settles an edit made before the family lands once it does', async () => {
    family.outcome = false;
    const before = articleTab();
    const pages = layOutPages(pagesOf(before));
    const first = pages[0]!.rect;
    const shape = createShape('square', first.x + first.width / 2 - 40, first.y + 300);
    const after = { ...before, elements: [shape] } as Tab;
    const seq = { current: 0 };
    const tickTabs = vi.fn();
    const { rerender } = renderHook(
      ({ tab }: { tab: Tab }) =>
        useArticleIntake({
          activeTab: tab,
          on: true,
          editable: true,
          pages,
          localEditSeq: seq,
          tickTabs,
        }),
      { initialProps: { tab: before } },
    );
    seq.current = 1;
    rerender({ tab: after });
    expect(tickTabs).not.toHaveBeenCalled();
    expect(handle.insertZone).not.toHaveBeenCalled();

    family.outcome = true;
    await act(async () => {
      const { loadKindFamily } = await import('@/lib/element-kinds/store');
      await loadKindFamily('pages-articles', 'element');
    });
    expect(handle.insertZone).toHaveBeenCalledTimes(1);
    expect(tickTabs).toHaveBeenCalledTimes(1);
  });
});

describe('useLeavePages before the pages family is in', () => {
  function leaving() {
    const rawSet = vi.fn<(m: EditorMode, alsoChange?: (t: Tab) => Tab) => void>();
    const { result } = renderHook(() =>
      useLeavePages({ mode: 'pages', setMode: rawSet }, { tab: articleTab(), canEdit: true }),
    );
    act(() => result.current.editorMode.setMode('diagram'));
    expect(result.current.leave.pending).toBe('diagram');
    return { result, rawSet };
  }

  it('turns the articles into pages once the family lands', async () => {
    const { result, rawSet } = leaving();
    act(() => result.current.leave.convert());
    await waitFor(() => expect(rawSet).toHaveBeenCalledTimes(1));
    const [mode, change] = rawSet.mock.calls[0]!;
    expect(mode).toBe('diagram');
    expect(Object.keys(change!(articleTab()).articles ?? {})).toEqual([]);
    expect(result.current.leave.pending).toBeNull();
  });

  it('keeps the question open, switching nothing, when the family cannot load', async () => {
    family.outcome = false;
    const { result, rawSet } = leaving();
    await act(async () => result.current.leave.convert());
    expect(family.asked).toEqual([['pages-articles', 'element']]);
    expect(rawSet).not.toHaveBeenCalled();
    expect(result.current.leave.pending).toBe('diagram');
  });
});
