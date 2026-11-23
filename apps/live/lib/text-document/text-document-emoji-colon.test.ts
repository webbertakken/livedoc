// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Emoji" ("Insert emoji using the colon character"): `:` at a word's start
// and two or more letters, digits, `_`, `+` or `-` asks for the list; Escape keeps it away until the word is left; a
// choice replaces what was typed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  colonQueryAt,
  emojiColon,
  replaceColonQuery,
  type ColonQuery,
} from './text-document-emoji-colon';

function stateOf(text: string, at = text.length + 1, plugins = [] as EditorState['plugins']) {
  const doc = schema.node('doc', null, [
    schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined),
  ]);
  return EditorState.create({ doc, selection: TextSelection.create(doc, at), plugins });
}

describe('colonQueryAt', () => {
  it.each([
    [':sm', { from: 1, to: 4, typed: 'sm' }],
    ['Hi :thumbs_up', { from: 4, to: 14, typed: 'thumbs_up' }],
    ['a :+1', { from: 3, to: 6, typed: '+1' }],
    ['a :t-rex', { from: 3, to: 9, typed: 't-rex' }],
  ])('reads %s', (text, query) => {
    expect(colonQueryAt(stateOf(text))).toEqual(query);
  });

  it.each(['a :s', 'Note:sm', ':sm ', 'a :', 'a ::sm', 'a :sm!'])('asks nothing for %s', (text) => {
    expect(colonQueryAt(stateOf(text))).toBeNull();
  });

  it('asks nothing for a selection, or and reads only what is before the caret', () => {
    const doc = stateOf(':smile').doc;
    expect(
      colonQueryAt(EditorState.create({ doc, selection: TextSelection.create(doc, 1, 4) })),
    ).toBeNull();
    expect(colonQueryAt(stateOf(':smile', 4))).toEqual({ from: 1, to: 4, typed: 'sm' });
  });
});

describe('replaceColonQuery', () => {
  it('puts the emoji in place of what was typed, the caret after it', () => {
    let state = stateOf('Hi :wav');
    const query = colonQueryAt(state)!;
    state = state.apply(replaceColonQuery(state, query, '👋'));
    expect(state.doc.textContent).toBe('Hi 👋');
    expect(state.selection.from).toBe(4 + '👋'.length);
  });
});

describe('emojiColon (the plugin)', () => {
  let view: EditorView | null = null;
  afterEach(() => view?.destroy());

  function mount(enabled = true) {
    const queries: (ColonQuery | null)[] = [];
    const colon = emojiColon({ enabled: () => enabled, onQuery: (q) => queries.push(q) });
    view = new EditorView(document.createElement('div'), {
      state: stateOf('', 1, [colon.plugin]),
    });
    const type = (text: string) => view!.dispatch(view!.state.tr.insertText(text));
    return { colon, queries, type };
  }

  it('reports the query as it is typed, and none once the word is left', () => {
    const { queries, type } = mount();
    type(':s');
    type('m');
    type(' ');
    expect(queries).toEqual([{ from: 1, to: 4, typed: 'sm' }, null]);
  });

  it('keeps away after Escape until the word is left', () => {
    const { colon, queries, type } = mount();
    type(':sm');
    colon.dismiss();
    type('i');
    type(' :ok');
    expect(queries).toEqual([
      { from: 1, to: 4, typed: 'sm' },
      null,
      { from: 6, to: 9, typed: 'ok' },
    ]);
  });

  it('reports nothing while switched off', () => {
    const { queries, type } = mount(false);
    type(':smile');
    expect(queries).toEqual([]);
  });

  it('hands keys to the list only while it is asked for', () => {
    const { colon, type } = mount();
    const keys = vi.fn(() => true);
    colon.setKeys(keys);
    const press = (key: string) =>
      view!.someProp('handleKeyDown', (f) => f(view!, new KeyboardEvent('keydown', { key })));
    expect(press('ArrowDown')).toBeFalsy();
    type(':sm');
    expect(press('ArrowDown')).toBe(true);
    expect(keys).toHaveBeenCalledOnce();
  });
});
