// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Inserting": picture files pasted are placed at the caret, dropped at the drop
// point; anything else is left to the clipboard's own paste.
import { describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textDocumentSchema as schema } from './text-document-schema';
import { pictureFilesOf, picturePastePlugin } from './text-document-picture-paste';

const png = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
const pdf = new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' });
const transfer = (files: File[]) => ({ files }) as unknown as DataTransfer;

function viewWith(take = vi.fn(() => true)) {
  const doc = schema.node('doc', null, [
    schema.nodes.paragraph!.create(null, [schema.text('abc')]),
  ]);
  const plugin = picturePastePlugin(take);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, plugins: [plugin], selection: TextSelection.create(doc, 1) }),
  });
  return { view, plugin, take };
}

describe('pictureFilesOf', () => {
  it('keeps the picture files only', () => {
    expect(pictureFilesOf(transfer([png, pdf]))).toEqual([png]);
    expect(pictureFilesOf(null)).toEqual([]);
  });
});

describe('picturePastePlugin', () => {
  it('takes the picture files of a paste', () => {
    const { view, plugin, take } = viewWith();
    const event = { clipboardData: transfer([png]) } as unknown as ClipboardEvent;
    expect(plugin.props.handlePaste!.call(plugin, view, event, null as never)).toBe(true);
    expect(take).toHaveBeenCalledWith([png], 'Paste');
  });

  it('leaves a paste without picture files to the clipboard', () => {
    const { view, plugin, take } = viewWith();
    const event = { clipboardData: transfer([pdf]) } as unknown as ClipboardEvent;
    expect(plugin.props.handlePaste!.call(plugin, view, event, null as never)).toBe(false);
    expect(take).not.toHaveBeenCalled();
  });

  it('places dropped pictures at the drop point', () => {
    const { view, plugin, take } = viewWith();
    view.posAtCoords = () => ({ pos: 3, inside: -1 });
    const event = {
      dataTransfer: transfer([png]),
      clientX: 5,
      clientY: 5,
      preventDefault: vi.fn(),
    } as unknown as DragEvent;
    expect(plugin.props.handleDrop!.call(plugin, view, event, null as never, false)).toBe(true);
    expect(view.state.selection.from).toBe(3);
    expect(take).toHaveBeenCalledWith([png], 'Drop');
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('leaves a move within the writing, and files a reader may not place, alone', () => {
    const { view, plugin } = viewWith(vi.fn(() => false));
    view.posAtCoords = () => ({ pos: 3, inside: -1 });
    const event = {
      dataTransfer: transfer([png]),
      preventDefault: vi.fn(),
    } as unknown as DragEvent;
    expect(plugin.props.handleDrop!.call(plugin, view, event, null as never, true)).toBe(false);
    expect(plugin.props.handleDrop!.call(plugin, view, event, null as never, false)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(view.state.selection.from).toBe(1);
  });
});
