// docs/specs/034-text-documents/text-and-paragraphs.md "Borders and shading".
import { describe, expect, it } from 'vitest';
import type { Node as PmNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { TextDocument, type ParagraphProps } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { bordersOf, setBordersAndShading, type BordersChange } from './text-document-borders';

const blank = TextDocument.blank({ format: 'odf' });
const formatting = { styles: blank.styles, defaults: blank.defaults };
const ALL = ['top', 'bottom', 'left', 'right', 'between'] as const;
const line = (width: number, extra = {}) => ({
  width,
  dash: 'solid' as const,
  color: '#000000',
  space: 0,
  ...extra,
});
const p = (props: ParagraphProps | null = null) =>
  schema.nodes.paragraph!.create({ props }, schema.text('text'));

// Both paragraphs selected.
function stateOf(...paragraphs: PmNode[]): EditorState {
  const doc = schema.node('doc', null, paragraphs);
  return EditorState.create({ doc, selection: TextSelection.create(doc, 1, doc.content.size - 1) });
}

function run(state: EditorState, command: Command): EditorState {
  let next = state;
  let steps = 0;
  expect(command(state, (tr) => ((steps += 1), (next = state.apply(tr))))).toBe(true);
  expect(steps).toBe(1);
  return next;
}
const propsOf = (state: EditorState) =>
  state.doc.content.content.map((n) => (n.attrs as { props: unknown }).props);

const nothing: BordersChange = {
  sides: ALL,
  width: null,
  dash: null,
  color: null,
  padding: null,
  shading: null,
};

describe('bordersOf', () => {
  it('reads what the paragraphs share over the pressed positions, 0 pt where there is no border', () => {
    const state = stateOf(p(), p());
    expect(bordersOf(state, formatting, ALL)).toEqual({
      width: 0,
      dash: null,
      color: null,
      padding: null,
      shading: 'none',
    });
  });

  it('reads blank where they differ, and only the pressed positions', () => {
    const state = stateOf(
      p({ borders: { top: line(1, { dash: 'dotted', space: 4 }) }, shading: '#fff2cc' }),
      p({ borders: { top: line(2, { dash: 'dotted', space: 4 }), bottom: line(1) } }),
    );
    expect(bordersOf(state, formatting, ['top'])).toEqual({
      width: null,
      dash: 'dotted',
      color: '#000000',
      padding: null,
      shading: null,
    });
    expect(bordersOf(state, formatting, ['left']).width).toBe(0);
  });
});

describe('setBordersAndShading', () => {
  it('sets the pressed positions, the padding on every side with a border, and the background', () => {
    const state = stateOf(p({ borders: { left: line(1) } }), p());
    const next = run(
      state,
      setBordersAndShading(formatting, {
        sides: ['top', 'bottom'],
        width: 2,
        dash: 'dashed',
        color: '#cc0000',
        padding: 4,
        shading: '#fff2cc',
      }),
    );
    const boxed = line(2, { dash: 'dashed', color: '#cc0000', space: 4 });
    expect(propsOf(next)).toEqual([
      { borders: { left: line(1, { space: 4 }), top: boxed, bottom: boxed }, shading: '#fff2cc' },
      { borders: { top: boxed, bottom: boxed }, shading: '#fff2cc' },
    ]);
  });

  it('changes nothing for blank fields, and adds no border where the width is blank', () => {
    const state = stateOf(p({ borders: { top: line(1) } }), p());
    const next = run(state, setBordersAndShading(formatting, { ...nothing, color: '#1155cc' }));
    expect(propsOf(next)).toEqual([{ borders: { top: line(1, { color: '#1155cc' }) } }, null]);
  });

  it('takes a border away at 0 pt, and leaves no formatting of its own once none is left', () => {
    const state = stateOf(p({ borders: { top: line(1) }, shading: '#fff2cc', align: 'center' }));
    const next = run(
      state,
      setBordersAndShading(formatting, { ...nothing, width: 0, padding: 0, shading: 'none' }),
    );
    expect(propsOf(next)).toEqual([{ align: 'center' }]);
  });

  it("lets a style's borders show once a paragraph has none of its own", () => {
    const h1 = blank.styles.find((s) => s.role === 'heading1')!;
    const styles = blank.styles.map((s) =>
      s.id === h1.id ? { ...s, paragraph: { ...s.paragraph, shading: '#cfe2f3' } } : s,
    );
    const doc = schema.node('doc', null, [
      schema.nodes.paragraph!.create(
        { style: h1.id, props: { shading: '#ffffff' } },
        schema.text('x'),
      ),
    ]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1) });
    const f = { ...formatting, styles };
    // The style's own colour stored as none of the paragraph's own.
    const next = run(state, setBordersAndShading(f, { ...nothing, shading: '#cfe2f3' }));
    expect(propsOf(next)).toEqual([null]);
    expect(bordersOf(next, f, ALL).shading).toBe('#cfe2f3');
  });
});
