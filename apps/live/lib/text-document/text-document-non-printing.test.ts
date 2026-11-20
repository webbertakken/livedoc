// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Non-printing characters": ¶ at each paragraph's end, · in each
// space, ↵ at each line break, only while shown, following the writing as it changes.
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView, type DecorationSet } from 'prosemirror-view';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  MARKS_CLASS,
  nonPrintingDecorations,
  nonPrintingKey,
  nonPrintingPlugin,
  setNonPrinting,
} from './text-document-non-printing';

const p = (text: string) =>
  schema.nodes.paragraph!.create({}, text ? schema.text(text) : undefined);
const doc = () => schema.node('doc', null, [p('a b'), p(''), p('c\nd')]);

const marks = (set: DecorationSet | undefined) =>
  (set?.find() ?? []).map((d) =>
    (d.spec as { key?: string }).key === 'pilcrow'
      ? `¶${d.from}`
      : `${(d as unknown as { type: { attrs: { class: string } } }).type.attrs.class}@${d.from}`,
  );

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

describe('non-printing characters', () => {
  it('marks spaces, line breaks and every paragraph end', () => {
    expect(marks(nonPrintingDecorations(doc()))).toEqual([
      'text-document-space-mark@2',
      '¶4',
      '¶6',
      'text-document-break-mark@9',
      '¶11',
    ]);
  });

  it('draws nothing until shown, then follows the writing, and goes when hidden', () => {
    view = new EditorView(document.body.appendChild(document.createElement('div')), {
      state: EditorState.create({ doc: doc(), plugins: [nonPrintingPlugin(false)] }),
    });
    const now = () => marks(nonPrintingKey.getState(view!.state)?.decorations);
    expect(now()).toEqual([]);
    expect(view.dom.classList.contains(MARKS_CLASS)).toBe(false);
    setNonPrinting(view, true);
    expect(view.dom.classList.contains(MARKS_CLASS)).toBe(true);
    expect(view.dom.querySelectorAll('.text-document-pilcrow')).toHaveLength(3);
    view.dispatch(view.state.tr.insertText(' x', 6));
    expect(now()).toEqual([
      'text-document-space-mark@2',
      '¶4',
      'text-document-space-mark@6',
      '¶8',
      'text-document-break-mark@11',
      '¶13',
    ]);
    const before = view.state;
    setNonPrinting(view, true);
    expect(view.state).toBe(before);
    setNonPrinting(view, false);
    expect(now()).toEqual([]);
    expect(view.dom.querySelectorAll('.text-document-pilcrow')).toHaveLength(0);
  });

  it('starts shown when asked', () => {
    const state = EditorState.create({ doc: doc(), plugins: [nonPrintingPlugin(true)] });
    expect(marks(nonPrintingKey.getState(state)?.decorations)).toHaveLength(5);
    expect(nonPrintingKey.getState(state.apply(state.tr))!.shown).toBe(true);
  });
});
