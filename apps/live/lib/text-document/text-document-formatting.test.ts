// docs/specs/034-text-documents/text-and-paragraphs.md "Text formatting".
import { describe, expect, it } from 'vitest';
import type { Mark, Node as PmNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { TextDocument } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  capitalise,
  isToggleOn,
  setTextColour,
  setTextFont,
  setTextSize,
  stepTextSize,
  textColourOf,
  textFontOf,
  textSizeOf,
  toggleText,
  toggleVertical,
  type TextFormatting,
} from './text-document-formatting';

const blank = TextDocument.blank({ format: 'odf' });
const formatting: TextFormatting = { styles: blank.styles, defaults: blank.defaults };
const mark = (name: string, value: unknown) => schema.marks[name]!.create({ value });
const text = (value: string, ...marks: Mark[]) => schema.text(value, marks);
const p = (nodes: PmNode[], style: string | null = null) =>
  schema.nodes.paragraph!.create({ style }, nodes);

// A state over one paragraph, with the selection from `from` to `to` (positions in the paragraph's text).
function stateOf(paragraph: PmNode, from: number, to = from): EditorState {
  const doc = schema.node('doc', null, [paragraph]);
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, from + 1, to + 1),
  });
}

function run(state: EditorState, command: Command): EditorState {
  let next = state;
  const ran = command(state, (tr) => (next = state.apply(tr)));
  expect(ran).toBe(true);
  return next;
}

// Each text node of the first paragraph as [text, { mark: value }].
const runs = (state: EditorState) => {
  const out: [string, Record<string, unknown>][] = [];
  state.doc.firstChild!.forEach((node) =>
    out.push([
      node.text!,
      Object.fromEntries(
        node.marks.map((m) => [m.type.name, (m.attrs as { value: unknown }).value]),
      ),
    ]),
  );
  return out;
};

describe('toggleText', () => {
  it('turns bold on for the whole selection', () => {
    const state = run(stateOf(p([text('Hello world')]), 0, 5), toggleText(formatting, 'bold'));
    expect(runs(state)).toEqual([
      ['Hello', { bold: true }],
      [' world', {}],
    ]);
    expect(isToggleOn(state, formatting, 'bold')).toBe(true);
  });

  it('turns a partly bold selection bold for all, as mixed reads as off', () => {
    const state = stateOf(p([text('He', mark('bold', true)), text('llo')]), 0, 5);
    expect(isToggleOn(state, formatting, 'bold')).toBe(false);
    expect(runs(run(state, toggleText(formatting, 'bold')))).toEqual([['Hello', { bold: true }]]);
  });

  it('turns an all bold selection off, storing nothing the style does not give', () => {
    const state = stateOf(p([text('Hello', mark('italic', true))]), 0, 5);
    const on = run(state, toggleText(formatting, 'italic'));
    expect(runs(on)).toEqual([['Hello', {}]]);
  });

  it('stores a false where the style gives the toggle, and nothing once it is back on', () => {
    const styles = blank.styles.map((s) =>
      s.role === 'heading1' ? { ...s, text: { ...s.text, bold: true } } : s,
    );
    const heading = { styles, defaults: blank.defaults };
    const state = stateOf(p([text('Title')], 'Heading_20_1'), 0, 5);
    expect(isToggleOn(state, heading, 'bold')).toBe(true);
    const off = run(state, toggleText(heading, 'bold'));
    expect(runs(off)).toEqual([['Title', { bold: false }]]);
    expect(runs(run(off, toggleText(heading, 'bold')))).toEqual([['Title', {}]]);
  });

  it('reads a text style under the run', () => {
    const styles = [
      ...blank.styles,
      {
        id: 'Strong',
        name: 'Strong',
        family: 'text' as const,
        paragraph: {},
        text: { bold: true },
      },
    ];
    const strong = schema.marks.text_style!.create({ id: 'Strong' });
    const state = stateOf(p([text('Hi', strong)]), 0, 2);
    expect(isToggleOn(state, { styles, defaults: blank.defaults }, 'bold')).toBe(true);
  });

  it('sets the formatting at the caret for the next characters typed, over no selection', () => {
    const state = run(stateOf(p([text('Hello')]), 5), toggleText(formatting, 'underline'));
    expect(isToggleOn(state, formatting, 'underline')).toBe(true);
    const typed = state.apply(state.tr.insertText('!'));
    expect(runs(typed)).toEqual([
      ['Hello', {}],
      ['!', { underline: true }],
    ]);
    const back = run(state, toggleText(formatting, 'underline'));
    expect(isToggleOn(back, formatting, 'underline')).toBe(false);
  });

  it('applies strikethrough and small caps the same way', () => {
    let state = stateOf(p([text('ab')]), 0, 2);
    state = run(state, toggleText(formatting, 'strike'));
    state = run(state, toggleText(formatting, 'smallCaps'));
    expect(runs(state)).toEqual([['ab', { strike: true, small_caps: true }]]);
  });
});

describe('toggleVertical', () => {
  it('raises the text, lowers it instead, and returns it to the baseline', () => {
    let state = stateOf(p([text('x2')]), 1, 2);
    state = run(state, toggleVertical(formatting, 'super'));
    expect(runs(state)).toEqual([
      ['x', {}],
      ['2', { vertical: 'super' }],
    ]);
    state = run(state, toggleVertical(formatting, 'sub'));
    expect(runs(state)[1]).toEqual(['2', { vertical: 'sub' }]);
    state = run(state, toggleVertical(formatting, 'sub'));
    expect(runs(state)).toEqual([['x2', {}]]);
  });
});

describe('text size', () => {
  it('reads the defaults, a style, a run of its own, and blank when mixed', () => {
    expect(textSizeOf(stateOf(p([text('a')]), 0, 1), formatting)).toBe(11);
    expect(textSizeOf(stateOf(p([text('a')], 'Title'), 0, 1), formatting)).toBe(26);
    const mixed = stateOf(p([text('a', mark('size', 14)), text('b')]), 0, 2);
    expect(textSizeOf(mixed, formatting)).toBeNull();
  });

  it('sets one size, rounded to a tenth, kept within 1 to 400, none stored where the style gives it', () => {
    const state = stateOf(p([text('ab')]), 0, 2);
    expect(runs(run(state, setTextSize(formatting, 10.55)))).toEqual([['ab', { size: 10.6 }]]);
    expect(runs(run(state, setTextSize(formatting, 900)))).toEqual([['ab', { size: 400 }]]);
    expect(runs(run(state, setTextSize(formatting, 0)))).toEqual([['ab', { size: 1 }]]);
    expect(runs(run(state, setTextSize(formatting, 11)))).toEqual([['ab', {}]]);
  });

  it('steps each character by a point, keeping a mixed selection’s differences', () => {
    const state = stateOf(p([text('a', mark('size', 14)), text('b')]), 0, 2);
    expect(runs(run(state, stepTextSize(formatting, 1)))).toEqual([
      ['a', { size: 15 }],
      ['b', { size: 12 }],
    ]);
    const top = stateOf(p([text('a', mark('size', 400))]), 0, 1);
    expect(runs(run(top, stepTextSize(formatting, 1)))).toEqual([['a', { size: 400 }]]);
  });
});

describe('capitalise', () => {
  it('rewrites the case, each character keeping its formatting', () => {
    const state = stateOf(p([text('hello ', mark('bold', true)), text('World')]), 0, 11);
    expect(runs(run(state, capitalise('uppercase')))).toEqual([
      ['HELLO ', { bold: true }],
      ['WORLD', {}],
    ]);
    expect(runs(run(state, capitalise('lowercase')))).toEqual([
      ['hello ', { bold: true }],
      ['world', {}],
    ]);
  });

  it('title-cases words across runs, reading the word before the selection', () => {
    const state = stateOf(p([text('the qUICK', mark('italic', true)), text('ish don’t')]), 0, 18);
    expect(runs(run(state, capitalise('titleCase')))).toEqual([
      ['The Quick', { italic: true }],
      ['ish Don’t', {}],
    ]);
    const inside = stateOf(p([text('hello wORLD')]), 7, 11);
    expect(runs(run(inside, capitalise('titleCase')))).toEqual([['hello world', {}]]);
  });

  it('keeps the selection over text whose length changed', () => {
    const state = run(stateOf(p([text('a straße b')]), 2, 8), capitalise('uppercase'));
    expect(runs(state)).toEqual([['a STRASSE b', {}]]);
    const { from, to } = state.selection;
    expect(state.doc.textBetween(from, to)).toBe('STRASSE');
  });

  it('changes nothing with nothing selected, or when the case already holds', () => {
    expect(capitalise('uppercase')(stateOf(p([text('abc')]), 1))).toBe(false);
    expect(capitalise('uppercase')(stateOf(p([text('ABC')]), 0, 3))).toBe(false);
  });
});

describe('text font', () => {
  it('reads the default family, a run of its own, and blank when mixed', () => {
    expect(textFontOf(stateOf(p([text('a')]), 0, 1), formatting)).toBe('Arial');
    const mixed = stateOf(p([text('a', mark('font', 'Lora')), text('b')]), 0, 2);
    expect(textFontOf(mixed, formatting)).toBeNull();
  });

  it('sets one family, none stored where the styles give it', () => {
    const state = stateOf(p([text('ab')]), 0, 2);
    const lora = run(state, setTextFont(formatting, 'Lora'));
    expect(runs(lora)).toEqual([['ab', { font: 'Lora' }]]);
    expect(textFontOf(lora, formatting)).toBe('Lora');
    expect(runs(run(lora, setTextFont(formatting, 'Arial')))).toEqual([['ab', {}]]);
  });
});

// docs/specs/034-text-documents/text-and-paragraphs.md "Colour".
describe('text colour and highlight', () => {
  const subtitle = blank.styles.find((st) => st.role === 'subtitle')!.id;

  it('reads the colour at the caret through the styles, none, or null when mixed', () => {
    expect(textColourOf(stateOf(p([text('Hi')]), 1), formatting, 'color')).toBeUndefined();
    expect(textColourOf(stateOf(p([text('Hi')], subtitle), 1), formatting, 'color')).toBe(
      '#666666',
    );
    const mixed = p([text('Re', mark('color', '#cc0000')), text('d')]);
    expect(textColourOf(stateOf(mixed, 0, 3), formatting, 'color')).toBeNull();
    expect(textColourOf(stateOf(mixed, 0, 2), formatting, 'color')).toBe('#cc0000');
    expect(textColourOf(stateOf(mixed, 0, 2), formatting, 'highlight')).toBeUndefined();
  });

  it('colours the selection, lower case, as one step', () => {
    const state = run(
      stateOf(p([text('Hello world')]), 0, 5),
      setTextColour(formatting, 'color', '#CC0000'),
    );
    expect(runs(state)).toEqual([
      ['Hello', { color: '#cc0000' }],
      [' world', {}],
    ]);
  });

  it('highlights the next characters typed at the caret', () => {
    const state = run(
      stateOf(p([text('Hi')]), 2),
      setTextColour(formatting, 'highlight', '#fff2cc'),
    );
    expect(
      state.storedMarks?.map((m) => [m.type.name, (m.attrs as { value: unknown }).value]),
    ).toEqual([['highlight', '#fff2cc']]);
  });

  it('stores a colour equal to the styles as none', () => {
    const state = run(
      stateOf(p([text('Grey')], subtitle), 0, 4),
      setTextColour(formatting, 'color', '#666666'),
    );
    expect(runs(state)).toEqual([['Grey', {}]]);
  });

  it("resets to the styles' colour, and None takes away the highlight", () => {
    const coloured = p(
      [text('Grey', mark('color', '#cc0000'), mark('highlight', '#fff2cc'))],
      subtitle,
    );
    let state = run(stateOf(coloured, 0, 4), setTextColour(formatting, 'color', null));
    state = run(state, setTextColour(formatting, 'highlight', null));
    expect(runs(state)).toEqual([['Grey', {}]]);
    expect(textColourOf(state, formatting, 'color')).toBe('#666666');
  });
});
