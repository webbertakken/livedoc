// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Paint format": the formatting clipboard, Copy and Paste text
// formatting, and the paint roller pressed once or held, painting the next selection made with the pointer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { track } from '@/lib/telemetry';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  copyTextFormatting,
  holdRoller,
  paintFormatOf,
  paintFormatPlugin,
  pasteTextFormatting,
  pressRoller,
} from './text-document-paint-format';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

// jsdom lays nothing out: the selection scrolled into view has no rectangles.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
// Nor finds a place under the pointer: the editor's own press handling places nothing.
document.elementFromPoint = () => null;

const bold = schema.marks.bold!.create({ value: true });

let view: EditorView;
// The transactions that changed the writing: each is one undo step.
let edits = 0;
beforeEach(() => {
  // "Bold" (bold) then " plain words here".
  const doc = schema.node('doc', null, [
    schema.nodes.paragraph!.create(null, [
      schema.text('Bold', [bold]),
      schema.text(' plain words here'),
    ]),
  ]);
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 3),
      plugins: [paintFormatPlugin()],
    }),
    dispatchTransaction(tr) {
      if (tr.docChanged) edits += 1;
      view.updateState(view.state.apply(tr));
    },
  });
  edits = 0;
  vi.mocked(track).mockClear();
});
afterEach(() => view.destroy());

const select = (from: number, to: number) =>
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
const isBold = (pos: number) =>
  bold.type.isInSet(view.state.doc.resolve(pos).marks()) !== undefined;
const roller = () => paintFormatOf(view.state).roller;

// A selection made with the pointer: pressed in the writing, selected, let go anywhere.
async function dragSelect(from: number, to: number) {
  view.dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  select(from, to);
  window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Copy and Paste text formatting', () => {
  it('copies without changing anything, then pastes onto another selection as one undo step', () => {
    const before = view.state.doc;
    expect(copyTextFormatting(view.state, view.dispatch)).toBe(true);
    expect(view.state.doc).toBe(before);
    select(6, 11);
    expect(pasteTextFormatting(view.state, view.dispatch)).toBe(true);
    expect(isBold(8)).toBe(true);
    expect(edits).toBe(1);
  });

  it('pastes nothing before anything is copied', () => {
    select(6, 11);
    expect(pasteTextFormatting(view.state, view.dispatch)).toBe(false);
    expect(isBold(8)).toBe(false);
  });
});

describe('the paint roller', () => {
  it('is off until pressed; a press copies and turns it on once; a second press turns it off', () => {
    expect(roller()).toBe('off');
    pressRoller(view.state, view.dispatch);
    expect(roller()).toBe('once');
    expect(paintFormatOf(view.state).copy).not.toBeNull();
    pressRoller(view.state, view.dispatch);
    expect(roller()).toBe('off');
  });

  it('paints the next selection made with the pointer, then lets go', async () => {
    pressRoller(view.state, view.dispatch);
    await dragSelect(6, 11);
    expect(isBold(8)).toBe(true);
    expect(roller()).toBe('off');
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentFormatPaint');
    // Painting and letting go are one transaction, so one undo step.
    expect(edits).toBe(1);
  });

  it('applies nothing to a press with no drag, and stays on', async () => {
    pressRoller(view.state, view.dispatch);
    await dragSelect(8, 8);
    expect(roller()).toBe('once');
    expect(track).not.toHaveBeenCalled();
  });

  it('held (a double press) paints every selection until pressed again', async () => {
    pressRoller(view.state, view.dispatch);
    holdRoller(view.state, view.dispatch);
    expect(roller()).toBe('held');
    await dragSelect(6, 11);
    await dragSelect(12, 17);
    expect(isBold(8) && isBold(14)).toBe(true);
    expect(roller()).toBe('held');
    pressRoller(view.state, view.dispatch);
    expect(roller()).toBe('off');
  });

  it('a double press holds it even from off, copying afresh', () => {
    holdRoller(view.state, view.dispatch);
    expect(roller()).toBe('held');
    expect(paintFormatOf(view.state).copy).not.toBeNull();
  });

  it('lets go on Escape in the writing, and passes Escape on when off', () => {
    pressRoller(view.state, view.dispatch);
    const escape = () => {
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      view.dom.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(escape()).toBe(true);
    expect(roller()).toBe('off');
    expect(escape()).toBe(false);
  });

  it('draws the pointer as a paint roller over the writing while on', () => {
    expect(view.dom.classList.contains('text-document-painting')).toBe(false);
    pressRoller(view.state, view.dispatch);
    expect(view.dom.classList.contains('text-document-painting')).toBe(true);
  });

  it('never paints a selection the pointer did not make', () => {
    pressRoller(view.state, view.dispatch);
    select(6, 11);
    expect(isBold(8)).toBe(false);
    expect(roller()).toBe('once');
  });
});
