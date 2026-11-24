// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "The picture's bar": under a selected picture, for whoever may edit, the
// five Text wrapping choices (the one in force pressed) and Image options; a drawing's Edit (Open for anyone who cannot
// edit) first; a plain picture has no bar for anyone who cannot edit; Left and Right move along it, Escape goes back to
// the writing; nothing outside an editor.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { PICTURE, PicturePlacements } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';
import { pictureView } from '@/lib/text-document/text-document-pictures';
import type { OpenDrawing } from '@/lib/text-document/text-document-drawing-open-plugin';

const editor = vi.hoisted(() => ({ value: {} as object | null }));
vi.mock('@/app/document/[id]/EditorContext', () => ({
  useOptionalEditorContext: () => editor.value,
}));

const { useTextDocumentPictureBar } = await import('./useTextDocumentPictureBar');

const views: EditorView[] = [];
afterEach(() => {
  views.splice(0).forEach((v) => {
    v.dom.remove();
    v.destroy();
  });
});
beforeEach(() => {
  editor.value = {};
  URL.createObjectURL = () => 'blob:x';
  URL.revokeObjectURL = () => {};
});

const WRAPPED = {
  wrap: 'behind',
  margin: PicturePlacements.margin(0),
  moves: 'with-text',
  x: 0,
  y: 0,
} as const;

function setup({
  canEdit = true,
  open = vi.fn<OpenDrawing>(),
  drawing = 'd1',
}: { canEdit?: boolean; open?: OpenDrawing | null; drawing?: string } = {}) {
  const pictures = [
    schema.nodes[PICTURE]!.create({ media: 'm', width: 60, height: 30, drawing }),
    schema.nodes[PICTURE]!.create({ media: 'm', width: 60, height: 30, placement: WRAPPED }),
  ];
  const doc = schema.node('doc', null, [schema.nodes.paragraph!.create(null, pictures)]);
  const view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({ doc, selection: TextSelection.create(doc, 1) }),
    nodeViews: {
      [PICTURE]: pictureView({
        media: () => ({ mediaType: 'image/png', bytes: new Uint8Array([1]) }),
        gallery: async () => null,
        release: () => {},
        bar: true,
      }),
    },
  });
  views.push(view);
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const wrap = vi.fn();
  const options = vi.fn();
  function Harness() {
    const opens = (id: string) => id !== 'gone';
    return (
      <>{useTextDocumentPictureBar({ view, canEdit, subscribe, open, opens, wrap, options })}</>
    );
  }
  const harness = render(<Harness />);
  const select = (pos: number) =>
    act(() => {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
      listeners.forEach((l) => l());
    });
  return { view, harness, select, open, wrap, options };
}

const pressed = () =>
  screen
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.getAttribute('aria-label'));

describe('useTextDocumentPictureBar', () => {
  it('puts the wraps and Image options under a selected picture, the one in force pressed', () => {
    const { select, wrap, options, view } = setup();
    expect(screen.queryByRole('toolbar')).toBeNull();
    select(2);
    const bar = screen.getByRole('toolbar', { name: 'Image' });
    expect(view.nodeDOM(2)!.contains(bar)).toBe(true);
    expect(pressed()).toEqual(['Behind text']);
    fireEvent.click(screen.getByRole('button', { name: 'Wrap text' }));
    expect(wrap).toHaveBeenCalledWith('wrap');
    fireEvent.click(screen.getByRole('button', { name: 'Image options' }));
    expect(options).toHaveBeenCalledOnce();
  });

  it('puts Edit first under a selected drawing, opening it where it is', () => {
    const { select, open } = setup();
    select(1);
    screen.getByRole('toolbar', { name: 'Drawing' });
    const names = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual([
      'Edit',
      'In line',
      'Wrap text',
      'Break text',
      'Behind text',
      'In front of text',
      'Image options',
    ]);
    expect(pressed()).toEqual(['In line']);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(open).toHaveBeenCalledWith('d1', 1);
  });

  it('offers Open alone to anyone who cannot edit, and no bar on a plain picture', () => {
    const { select } = setup({ canEdit: false });
    select(1);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Open']);
    select(2);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('leaves Edit off a drawing whose tab is not there, or where none may be opened', () => {
    setup({ drawing: 'gone' }).select(1);
    expect(screen.getByRole('toolbar', { name: 'Image' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    views.splice(0).forEach((v) => v.destroy());
    document.body.replaceChildren();
    const closed = setup({ open: null, canEdit: false });
    closed.select(1);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('moves along the bar with Left and Right, and goes back to the writing on Escape', () => {
    const { select, view } = setup();
    select(1);
    const edit = screen.getByRole('button', { name: 'Edit' });
    edit.focus();
    fireEvent.keyDown(edit, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'In line' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Image options' }));
    const focus = vi.spyOn(view, 'focus');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(focus).toHaveBeenCalled();
  });

  it('draws nothing outside an editor', () => {
    editor.value = null;
    setup().select(2);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});
