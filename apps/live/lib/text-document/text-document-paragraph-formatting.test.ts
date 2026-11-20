// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Alignment and indents": a paragraph's own formatting over
// its style's, set on every paragraph the selection touches.
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { TextDocument, type Style } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  alignmentOf,
  indentsOf,
  INDENT_MAX_PT,
  isKeepOn,
  KEEP_RULES,
  LINE_SPACINGS,
  lineSpacingOf,
  PARAGRAPH_SPACE_PT,
  setLineSpacing,
  setSpacing,
  spaceOf,
  spacingOf,
  toggleKeep,
  toggleSpace,
  INDENT_STEP_PT,
  setAlignment,
  setIndents,
  stepIndent,
} from './text-document-paragraph-formatting';

const blank = TextDocument.blank({ format: 'odf' });
const centredTitle: Style[] = blank.styles.map((s) =>
  s.role === 'title' ? { ...s, paragraph: { ...s.paragraph, align: 'center' } } : s,
);
const formatting = { styles: centredTitle as readonly Style[], defaults: blank.defaults };
const p = (text: string, attrs: Record<string, unknown> = {}) =>
  schema.nodes.paragraph!.create({ style: null, ...attrs }, text ? schema.text(text) : undefined);

function stateOf(paragraphs: ReturnType<typeof p>[], from: number, to = from) {
  const doc = schema.node('doc', null, paragraphs);
  return EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
}
const run = (state: EditorState, command: ReturnType<typeof setAlignment>) => {
  let next = state;
  command(state, (tr) => (next = state.apply(tr)));
  return next;
};
const propsOf = (state: EditorState) => {
  const out: unknown[] = [];
  state.doc.forEach((node) => out.push((node.attrs as { props: unknown }).props));
  return out;
};

describe('alignment', () => {
  it('sets it on every paragraph the selection touches, as one step', () => {
    const state = stateOf([p('one'), p('two'), p('three')], 2, 7);
    const after = run(state, setAlignment(formatting, 'justify'));
    expect(propsOf(after)).toEqual([{ align: 'justify' }, { align: 'justify' }, null]);
    expect(alignmentOf(after, formatting)).toBe('justify');
  });

  it("stores an alignment equal to the style's as none of its own", () => {
    const state = stateOf([p('Title', { style: 'Title', props: { align: 'end' } })], 2);
    expect(alignmentOf(state, formatting)).toBe('end');
    const after = run(state, setAlignment(formatting, 'center'));
    expect(propsOf(after)).toEqual([null]);
    expect(alignmentOf(after, formatting)).toBe('center');
    expect(propsOf(run(stateOf([p('a')], 1), setAlignment(formatting, 'start')))).toEqual([null]);
  });

  it('reads null when the paragraphs differ', () => {
    const state = stateOf([p('a', { props: { align: 'end' } }), p('b')], 1, 5);
    expect(alignmentOf(state, formatting)).toBeNull();
  });

  it("keeps the paragraph's other formatting", () => {
    const state = stateOf([p('a', { props: { spaceAfter: 6, align: 'end' } })], 1);
    expect(propsOf(run(state, setAlignment(formatting, 'start')))).toEqual([{ spaceAfter: 6 }]);
  });
});

describe('Increase and Decrease indent', () => {
  it('moves by 0.5 in from where each paragraph is, a first-line indent moving with it', () => {
    const state = stateOf([p('a'), p('b', { props: { indentStart: 18, indentFirst: -18 } })], 1, 5);
    const after = run(state, stepIndent(formatting, INDENT_STEP_PT));
    expect(propsOf(after)).toEqual([{ indentStart: 36 }, { indentStart: 54, indentFirst: -18 }]);
  });

  it('never goes past 0 decreasing, nor past the most increasing', () => {
    let state = stateOf([p('a', { props: { indentStart: 20 } })], 1);
    state = run(state, stepIndent(formatting, -INDENT_STEP_PT));
    expect(propsOf(state)).toEqual([null]);
    state = run(stateOf([p('a', { props: { indentStart: 420 } })], 1), stepIndent(formatting, 36));
    expect(propsOf(state)).toEqual([{ indentStart: INDENT_MAX_PT }]);
  });
});

describe('indentsOf and setIndents (Indentation options)', () => {
  it('reads the indents, null where the paragraphs differ', () => {
    const state = stateOf(
      [
        p('a', { props: { indentStart: 36, indentFirst: 18 } }),
        p('b', { props: { indentStart: 36 } }),
      ],
      1,
      5,
    );
    expect(indentsOf(state, formatting)).toEqual({ start: 36, end: 0, first: null });
  });

  it('sets the indents given, leaving one not given as each paragraph has it', () => {
    const state = stateOf(
      [p('a', { props: { indentFirst: 18 } }), p('b', { props: { indentFirst: -9 } })],
      1,
      5,
    );
    const after = run(state, setIndents(formatting, { start: 72, end: 0, first: null }));
    expect(propsOf(after)).toEqual([
      { indentFirst: 18, indentStart: 72 },
      { indentFirst: -9, indentStart: 72 },
    ]);
  });

  it('changes nothing for indents that are already so', () => {
    const state = stateOf([p('a')], 1);
    let changed = false;
    setIndents(formatting, { start: 0, end: 0, first: 0 })(
      state,
      (tr) => (changed = tr.docChanged),
    );
    expect(changed).toBe(false);
  });
});

// text-and-paragraphs.md "Spacing and keep rules".
describe('line spacing', () => {
  it('sets a preset, reads it back, and reads none for a custom value or when the paragraphs differ', () => {
    const state = stateOf([p('a'), p('b')], 1, 4);
    expect(lineSpacingOf(state, formatting)).toBe(1.15);
    const doubled = run(state, setLineSpacing(formatting, 2));
    expect(propsOf(doubled)).toEqual([
      { lineHeight: { rule: 'multiple', value: 2 } },
      { lineHeight: { rule: 'multiple', value: 2 } },
    ]);
    expect(lineSpacingOf(doubled, formatting)).toBe(2);
    expect(propsOf(run(doubled, setLineSpacing(formatting, 1.15)))).toEqual([null, null]);
    const exact = stateOf([p('a', { props: { lineHeight: { rule: 'exact', pt: 14 } } })], 1);
    expect(lineSpacingOf(exact, formatting)).toBeNull();
    expect(
      lineSpacingOf(
        stateOf([p('a', { props: { lineHeight: { rule: 'multiple', value: 2 } } }), p('b')], 1, 4),
        formatting,
      ),
    ).toBeNull();
    expect(LINE_SPACINGS.map((s) => [s.label, s.value])).toEqual([
      ['Single', 1],
      ['1.15', 1.15],
      ['1.5', 1.5],
      ['Double', 2],
    ]);
  });
});

describe('add and remove space', () => {
  it('adds 12 pt where the paragraphs have none, and removes it where they have some', () => {
    let state = stateOf([p('a')], 1);
    expect(spaceOf(state, formatting, 'spaceBefore')).toBe(0);
    state = run(state, toggleSpace(formatting, 'spaceBefore'));
    expect(propsOf(state)).toEqual([{ spaceBefore: PARAGRAPH_SPACE_PT }]);
    expect(spaceOf(state, formatting, 'spaceBefore')).toBe(12);
    state = run(state, toggleSpace(formatting, 'spaceBefore'));
    expect(propsOf(state)).toEqual([null]);
  });

  it("removes a heading's space from its style as its own 0", () => {
    const state = stateOf([p('H', { style: 'Heading_20_1' })], 1);
    expect(spaceOf(state, formatting, 'spaceBefore')).toBe(20);
    expect(propsOf(run(state, toggleSpace(formatting, 'spaceBefore')))).toEqual([
      { spaceBefore: 0 },
    ]);
  });
});

describe('custom spacing', () => {
  it('reads line spacing and space before and after, null where the paragraphs differ', () => {
    const state = stateOf([p('a', { props: { spaceAfter: 6 } }), p('b')], 1, 4);
    expect(spacingOf(state, formatting)).toEqual({ lineHeight: 1.15, before: 0, after: null });
  });

  it('sets what is given, leaving a null as each paragraph has it', () => {
    const state = stateOf([p('a', { props: { spaceAfter: 6 } }), p('b')], 1, 4);
    const after = run(state, setSpacing(formatting, { lineHeight: 1.5, before: 3, after: null }));
    expect(propsOf(after)).toEqual([
      { spaceAfter: 6, lineHeight: { rule: 'multiple', value: 1.5 }, spaceBefore: 3 },
      { lineHeight: { rule: 'multiple', value: 1.5 }, spaceBefore: 3 },
    ]);
  });
});

describe('keep rules', () => {
  it('turns a rule on for all unless all have it, then off for all', () => {
    let state = stateOf([p('a'), p('b', { props: { keepTogether: true } })], 1, 4);
    expect(isKeepOn(state, formatting, 'keepTogether')).toBe(false);
    state = run(state, toggleKeep(formatting, 'keepTogether'));
    expect(propsOf(state)).toEqual([{ keepTogether: true }, { keepTogether: true }]);
    expect(isKeepOn(state, formatting, 'keepTogether')).toBe(true);
    state = run(state, toggleKeep(formatting, 'keepTogether'));
    expect(propsOf(state)).toEqual([null, null]);
  });

  it("reads a new document's prevent single lines, and a heading's keep with next, from their styles", () => {
    const state = stateOf([p('H', { style: 'Heading_20_1' })], 1);
    expect(isKeepOn(state, formatting, 'keepWithNext')).toBe(true);
    expect(isKeepOn(state, formatting, 'widowControl')).toBe(true);
    expect(propsOf(run(state, toggleKeep(formatting, 'widowControl')))).toEqual([
      { widowControl: false },
    ]);
    expect(KEEP_RULES.map((k) => k.item)).toEqual([
      'keep-with-next',
      'keep-lines-together',
      'prevent-single-lines',
    ]);
  });
});
