// @vitest-environment jsdom
// docs/specs/034-text-documents/links-and-navigation.md "Table of contents", "Share roles", "Telemetry": Insert > Table of
// contents is an Editor's, dimmed in a table; it goes in built from the headings, its entries in the Contents styles
// made when first needed (a file's own kept), its page numbers read again once the pages are laid out with it in;
// counted.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { Node as PmNode } from 'prosemirror-model';
import { Contents, TextDocumentState, type Style } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';

const { track, shown } = vi.hoisted(() => ({
  track: vi.fn(),
  shown: { pageOfBlock: null as ((block: number) => number) | null },
}));
vi.mock('@/lib/telemetry', () => ({ track }));
vi.mock('@/lib/text-document/pagination/pagination-plugin', () => ({
  shownPageOfBlock: () => shown.pageOfBlock,
}));

const { useTextDocumentContents } = await import('./useTextDocumentContents');

const p = (text: string, level: number | null = null) =>
  schema.nodes.paragraph!.create(
    level === null ? {} : { props: { outlineLevel: level } },
    schema.text(text),
  );

function setup({
  doc = schema.node('doc', null, [p('Intro'), p('One', 1), p('Two', 2)]),
  at = 1,
  writes = true,
  pageless = false,
  styles = [] as Style[],
} = {}) {
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, selection: TextSelection.create(doc, at) }),
  });
  const live = TextDocumentState.load();
  if (styles.length > 0) TextDocumentState.setStyles(live, 'odf', styles);
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const hook = renderHook(() =>
    useTextDocumentContents({
      view,
      writes,
      liveDoc: { current: live },
      format: 'odf',
      pageless,
      textWidth: 468,
      subscribe,
    }),
  );
  const moveTo = (pos: number) =>
    act(() => {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
      for (const listener of listeners) listener();
    });
  return { view, hook, live, moveTo };
}

const entries = (block: PmNode | null | undefined) => {
  const out: [string, unknown][] = [];
  block?.forEach((e) => out.push([e.textContent, (e.attrs as { style: unknown }).style]));
  return out;
};

beforeEach(() => {
  track.mockReset();
  shown.pageOfBlock = null;
});
afterEach(() => vi.restoreAllMocks());

describe('useTextDocumentContents', () => {
  it('binds nothing for whoever may not write the body', () => {
    expect(setup({ writes: false }).hook.result.current).toEqual({});
  });

  it('puts one in, its Contents styles made, its page numbers read again once laid out, counted', async () => {
    // Before it goes in, the headings are on pages 1 and 2; laid out with it in, on 2 and 3.
    shown.pageOfBlock = (block) => (block < 2 ? 1 : 2);
    const { view, hook, live } = setup({ at: 6 });
    act(() => {
      hook.result.current['toc-dotted']!.run();
      shown.pageOfBlock = (block) => block;
    });
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith('Element', 'Added', 'TextDocumentTableOfContents'),
    );
    const block = view.state.doc.child(1);
    expect(block.type.name).toBe('table_of_contents');
    expect(entries(block)).toEqual([
      ['One\t2', 'Contents_20_1'],
      ['Two\t3', 'Contents_20_2'],
    ]);
    const styles = TextDocumentState.styles(live, 'odf');
    expect(Contents.heldStyle(styles, 1)?.name).toBe('Contents 1');
    expect(Contents.heldStyle(styles, 2)?.name).toBe('Contents 2');
    expect(Contents.heldStyle(styles, 3)).toBeUndefined();
  });

  it('keeps a file’s own Contents style', async () => {
    const own: Style = {
      id: 'Mine1',
      name: 'Contents 1',
      family: 'paragraph',
      paragraph: {},
      text: {},
    };
    const { view, hook, live } = setup({ pageless: true, styles: [own] });
    act(() => hook.result.current['toc-plain']!.run());
    await waitFor(() => expect(track).toHaveBeenCalled());
    expect(entries(view.state.doc.child(0))).toEqual([
      ['One', 'Mine1'],
      ['Two', 'Contents_20_2'],
    ]);
    expect(
      TextDocumentState.styles(live, 'odf').filter((s) => s.name === 'Contents 1'),
    ).toHaveLength(1);
  });

  it('is dimmed while the caret is in a table', () => {
    const cell = schema.nodes.table_cell!.create(null, p('x'));
    const table = schema.nodes.table!.create(null, schema.nodes.table_row!.create(null, cell));
    const doc = schema.node('doc', null, [p('Intro'), table, p('One', 1)]);
    const { hook, moveTo } = setup({ doc });
    expect(hook.result.current['toc-links']!.disabled).toBe(false);
    moveTo(11);
    expect(hook.result.current['toc-links']!.disabled).toBe(true);
    // Run anyway (a stale menu): nothing goes in.
    act(() => hook.result.current['toc-links']!.run());
    expect(track).not.toHaveBeenCalled();
  });
});
