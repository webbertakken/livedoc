// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Writing": Tab types a tab; over paragraphs, Tab and Shift+Tab
// step the indent; elsewhere Shift+Tab is held so focus stays in the writing; Shift+Enter is a line break.
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { Styles, type ParagraphProps } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  insertLineBreak,
  pressShiftTab,
  pressTab,
  writingKeysPlugin,
} from './text-document-writing-keys';

const formatting = () => ({ styles: Styles.builtIn('odf'), defaults: Styles.defaults() });
const p = (text: string) =>
  schema.nodes.paragraph!.create({ style: 'Standard' }, schema.text(text));

function run(command: Command, from: number, to = from) {
  const doc = schema.node('doc', null, [p('one'), p('two')]);
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
  const done = command(state, (tr) => {
    state = state.apply(tr);
  });
  const props = (i: number) =>
    (state.doc.child(i).attrs as { props: ParagraphProps | null }).props?.indentStart;
  return { done, text: state.doc.textBetween(0, state.doc.content.size, '|'), props };
}

describe('the Tab key', () => {
  it('types a tab in place of the selection within a paragraph', () => {
    expect(run(pressTab(formatting), 2).text).toBe('o\tne|two');
    expect(run(pressTab(formatting), 1, 3).text).toBe('\te|two');
  });

  it('steps the indent of every paragraph a selection spans, either way', () => {
    const forward = run(pressTab(formatting), 2, 7);
    expect([forward.text, forward.props(0), forward.props(1)]).toEqual(['one|two', 36, 36]);
    const back = run(pressShiftTab(formatting), 2, 7);
    expect([back.done, back.props(0)]).toEqual([true, undefined]);
  });

  it('breaks the line on Shift+Enter, keeping one paragraph', () => {
    expect(run(insertLineBreak, 2).text).toBe('o\nne|two');
  });

  it('holds Shift+Tab within a paragraph, changing nothing', () => {
    expect(run(pressShiftTab(formatting), 2)).toMatchObject({ done: true, text: 'one|two' });
  });

  it('leaves both keys to the browser where the writing takes no edits', () => {
    const plugin = writingKeysPlugin(formatting);
    const doc = schema.node('doc', null, [p('one')]);
    const state = EditorState.create({ doc });
    const press = (key: string, editable: boolean) =>
      plugin.props.handleKeyDown!.call(
        plugin,
        { state, editable, dispatch: () => {} } as never,
        new KeyboardEvent('keydown', { key, shiftKey: key === 'Shift-Tab' }),
      );
    expect(press('Tab', false)).toBe(false);
    expect(press('Tab', true)).toBe(true);
  });
});
