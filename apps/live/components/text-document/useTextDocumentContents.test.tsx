// @vitest-environment jsdom
// docs/specs/034-text-documents/links-and-navigation.md "Table of contents", "Share roles", "Telemetry": Insert > Table of
// contents is an Editor's, dimmed in a table; it goes in built from the headings, its entries in the Contents styles
// made when first needed (a file's own kept), its page numbers read again once the pages are laid out with it in;
// counted.
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { Node as PmNode } from 'prosemirror-model';
import { Contents, TextDocumentState, type Style } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';
import { contentsView } from '@/lib/text-document/text-document-contents';

const { track, shown } = vi.hoisted(() => ({
  track: vi.fn(),
  shown: { pageOfBlock: null as ((block: number) => number) | null },
}));
vi.mock('@/lib/telemetry', () => ({ track }));
vi.mock('@/lib/text-document/pagination/pagination-plugin', () => ({
  shownPageOfBlock: () => shown.pageOfBlock,
}));

const { useTextDocumentContents } = await import('./useTextDocumentContents');
type TextDocumentContents = ReturnType<typeof useTextDocumentContents>;

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
  const listeners = new Set<() => void>();
  // Told of every change, as the surface's caret subscription is.
  const view: EditorView = new EditorView(
    document.body.appendChild(document.createElement('div')),
    {
      state: EditorState.create({ doc, selection: TextSelection.create(doc, at) }),
      nodeViews: { table_of_contents: contentsView },
      dispatchTransaction: (tr) => {
        view.updateState(view.state.apply(tr));
        for (const listener of listeners) listener();
      },
    },
  );
  const openOptions = vi.fn();
  const live = TextDocumentState.load();
  if (styles.length > 0) TextDocumentState.setStyles(live, 'odf', styles);
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  // Drawn as the surface draws it, its bar too.
  const latest: { current: TextDocumentContents | null } = { current: null };
  function Harness() {
    const contents = useTextDocumentContents({
      view,
      writes,
      liveDoc: { current: live },
      format: 'odf',
      pageless,
      textWidth: 468,
      subscribe,
      openOptions,
    });
    latest.current = contents;
    return <>{contents.bar}</>;
  }
  render(<Harness />);
  const hook = {
    result: {
      get current() {
        return latest.current!;
      },
    },
  };
  const moveTo = (pos: number) =>
    act(() => {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
    });
  const select = (pos: number) =>
    act(() => {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    });
  return { view, hook, live, moveTo, select, openOptions };
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
    const { hook } = setup({ writes: false });
    expect(hook.result.current.actions).toEqual({});
    expect(hook.result.current.bar).toBeNull();
  });

  it('puts one in, its Contents styles made, its page numbers read again once laid out, counted', async () => {
    // Before it goes in, the headings are on pages 1 and 2; laid out with it in, on 2 and 3.
    shown.pageOfBlock = (block) => (block < 2 ? 1 : 2);
    const { view, hook, live } = setup({ at: 6 });
    act(() => {
      hook.result.current.actions['toc-dotted']!.run();
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
    act(() => hook.result.current.actions['toc-plain']!.run());
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
    expect(hook.result.current.actions['toc-links']!.disabled).toBe(false);
    moveTo(11);
    expect(hook.result.current.actions['toc-links']!.disabled).toBe(true);
    // Run anyway (a stale menu): nothing goes in.
    act(() => hook.result.current.actions['toc-links']!.run());
    expect(track).not.toHaveBeenCalled();
  });

  it('draws its bar into the selected block; Update renumbers it, the options panel changes it, counted', async () => {
    shown.pageOfBlock = (block) => block + 1;
    const { view, hook, select, openOptions } = setup({ at: 1 });
    act(() => hook.result.current.actions['toc-plain']!.run());
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
    expect(hook.result.current.selected).toMatchObject({ pos: 0, look: 'plain', levels: 6 });
    const nav = view.dom.querySelector('nav')!;
    await waitFor(() =>
      expect(within(nav).getByRole('toolbar', { name: 'Table of contents' })).toBeTruthy(),
    );

    // The pages moved: Update reads them again.
    shown.pageOfBlock = (block) => block + 5;
    fireEvent.click(within(nav).getByRole('button', { name: 'Update table of contents' }));
    await waitFor(() =>
      expect(track).toHaveBeenLastCalledWith('Element', 'Changed', 'TextDocumentTableOfContents'),
    );
    expect(entries(view.state.doc.child(0)).map(([text]) => text)).toEqual(['One\t7', 'Two\t8']);
    fireEvent.click(within(nav).getByRole('button', { name: 'Table of contents options' }));
    expect(openOptions).toHaveBeenCalledOnce();

    // The panel: With blue links, Levels 1.
    act(() => hook.result.current.change({ look: 'links', levels: 1 }));
    await waitFor(() => expect(track).toHaveBeenCalledTimes(3));
    expect(view.state.doc.child(0).attrs).toMatchObject({ look: 'links', levels: 1 });
    expect(entries(view.state.doc.child(0)).map(([text]) => text)).toEqual(['One']);
    select(0);
    expect(hook.result.current.selected).toMatchObject({ look: 'links', levels: 1 });
  });
});
