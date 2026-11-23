// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Special characters" ("Inserting"): the character replaces the selection,
// taking the caret's formatting, the caret after it; each press is one undo step, counted; for an Editor only. "Emoji":
// inserted, counted, the same way.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { track } from '@/lib/telemetry';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  EMOJI_ITEM,
  SPECIAL_CHARACTERS_ITEM,
  characterDialogActions,
  insertCharacter,
  insertPicked,
} from './text-document-special-characters';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const bold = schema.marks.bold!.create({ value: true });

function stateOf(from: number, to = from) {
  const doc = schema.node('doc', null, [
    schema.nodes.paragraph!.create(null, [schema.text('ab', [bold]), schema.text('cd')]),
  ]);
  return EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
}

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
  vi.mocked(track).mockClear();
});

describe('insertCharacter', () => {
  it('replaces the selection, the caret after the character', () => {
    let next = stateOf(2, 4);
    expect(insertCharacter('→')(next, (tr) => (next = next.apply(tr)))).toBe(true);
    expect(next.doc.textContent).toBe('a→d');
    expect(next.selection.from).toBe(3);
  });

  it('takes the caret’s formatting', () => {
    let next = stateOf(3);
    insertCharacter('★')(next, (tr) => (next = next.apply(tr)));
    expect(next.doc.firstChild!.child(0).text).toBe('ab★');
    expect(next.doc.firstChild!.child(0).marks).toEqual([bold]);
  });

  it('puts in nothing for no text', () => {
    expect(insertCharacter('')(stateOf(1))).toBe(false);
  });
});

describe('characterDialogActions and insertPicked', () => {
  it('opens either dialog for an Editor, and binds nothing for anyone else', () => {
    const open = vi.fn();
    view = new EditorView(document.createElement('div'), { state: stateOf(1) });
    const actions = characterDialogActions(view, true, open);
    actions[SPECIAL_CHARACTERS_ITEM]!.run();
    actions[EMOJI_ITEM]!.run();
    expect(open.mock.calls).toEqual([['special-characters'], ['emoji']]);
    expect(characterDialogActions(view, false, open)).toEqual({});
    open.mockClear();
    characterDialogActions(null, true, open)[EMOJI_ITEM]!.run();
    expect(open).not.toHaveBeenCalled();
  });

  it('puts a pressed character in and counts it, nothing once the editor is gone', () => {
    view = new EditorView(document.createElement('div'), { state: stateOf(5) });
    expect(insertPicked(view, '😀', 'emoji')).toBe(true);
    expect(view.state.doc.textContent).toBe('abcd😀');
    expect(track).toHaveBeenCalledWith('Element', 'Added', 'TextDocumentEmoji');
    expect(insertPicked(view, '→', 'special-characters')).toBe(true);
    expect(track).toHaveBeenCalledWith('Element', 'Added', 'TextDocumentSpecialCharacter');
    view.destroy();
    expect(insertPicked(view, '😀', 'emoji')).toBe(false);
    view = null;
  });
});
