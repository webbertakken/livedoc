// docs/specs/034-text-documents/editing-surface.md "The ruler": what it reads at the selection's start, and indents
// and tab stops set on every paragraph the selection touches, held within the text area.
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import {
  TextDocument,
  type ParagraphProps,
  type Style,
  type TabStop,
} from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  addTabStop,
  INDENT_GAP_PT,
  moveTabStop,
  removeTabStop,
  rulerReading,
  setRulerIndent,
} from './text-document-ruler';

const blank = TextDocument.blank({ format: 'odf' });
const styleStops: TabStop[] = [{ position: 100, align: 'start' }];
const styles: Style[] = blank.styles.map((s) =>
  s.role === 'title' ? { ...s, paragraph: { ...s.paragraph, tabStops: styleStops } } : s,
);
const formatting = { styles: styles as readonly Style[], defaults: blank.defaults };
const p = (text: string, props: ParagraphProps | null = null, style: string | null = null) =>
  schema.nodes.paragraph!.create({ style, props }, schema.text(text));

function run(command: Command, paragraphs: ReturnType<typeof p>[], from = 1, to = from) {
  const doc = schema.node('doc', null, paragraphs);
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
  command(state, (tr) => {
    state = state.apply(tr);
  });
  return [0, 1]
    .filter((i) => i < state.doc.childCount)
    .map((i) => (state.doc.child(i).attrs as { props: ParagraphProps | null }).props);
}

describe('rulerReading', () => {
  it("reads the indents and stops of the paragraph at the selection's start, its style's where it has none", () => {
    const doc = schema.node('doc', null, [
      p('a', { indentStart: 36, indentFirst: -18, indentEnd: 9 }),
      p('b', null, 'Title'),
    ]);
    const at = (pos: number) =>
      rulerReading(
        EditorState.create({ doc, selection: TextSelection.create(doc, pos) }),
        formatting,
      );
    expect(at(1)).toEqual({ indentStart: 36, indentFirst: -18, indentEnd: 9, stops: [] });
    expect(at(4).stops).toEqual(styleStops);
  });
});

describe('setRulerIndent', () => {
  const width = 468;
  it('moves the left indent with the first line, held within the text area and away from the right indent', () => {
    expect(
      run(setRulerIndent(formatting, 'left', 72, width), [p('a', { indentFirst: 18 })]),
    ).toEqual([{ indentFirst: 18, indentStart: 72 }]);
    expect(
      run(setRulerIndent(formatting, 'left', -10, width), [p('a', { indentStart: 36 })]),
    ).toEqual([null]);
    expect(
      run(setRulerIndent(formatting, 'left', 500, width), [p('a', { indentEnd: 100 })]),
    ).toEqual([{ indentEnd: 100, indentStart: width - 100 - INDENT_GAP_PT }]);
  });

  it('sets the first line alone, as a first-line or hanging indent from the left', () => {
    expect(
      run(setRulerIndent(formatting, 'first', 18, width), [p('a', { indentStart: 36 })]),
    ).toEqual([{ indentStart: 36, indentFirst: -18 }]);
  });

  it('sets the right indent from the right edge, on every paragraph the selection touches', () => {
    expect(
      run(
        setRulerIndent(formatting, 'right', 400, width),
        [p('a'), p('b', { indentStart: 400 })],
        1,
        4,
      ),
    ).toEqual([{ indentEnd: 68 }, { indentStart: 400, indentEnd: 32 }]);
  });
});

describe('tab stops on the ruler', () => {
  it('adds a stop over any at its place, on every paragraph the selection touches', () => {
    expect(
      run(
        addTabStop(formatting, 'end', 200),
        [p('a', { tabStops: [{ position: 200, align: 'start' }] }), p('b')],
        1,
        4,
      ),
    ).toEqual([
      { tabStops: [{ position: 200, align: 'end' }] },
      { tabStops: [{ position: 200, align: 'end' }] },
    ]);
  });

  it("adds to a style's stops, and a list equal to the style's is none of its own", () => {
    expect(run(addTabStop(formatting, 'center', 50), [p('a', null, 'Title')])).toEqual([
      { tabStops: [{ position: 50, align: 'center' }, ...styleStops] },
    ]);
    expect(run(addTabStop(formatting, 'start', 100), [p('a', null, 'Title')])).toEqual([null]);
  });

  it('moves a stop, keeping its alignment and leader, and leaves a paragraph without it alone', () => {
    const own: TabStop[] = [
      { position: 50, align: 'end', leader: 'dot' },
      { position: 120, align: 'start' },
    ];
    expect(
      run(moveTabStop(formatting, 50, 120), [p('a', { tabStops: own }), p('b')], 1, 4),
    ).toEqual([{ tabStops: [{ position: 120, align: 'end', leader: 'dot' }] }, null]);
  });

  it('takes a stop away, leaving a paragraph without it alone', () => {
    expect(run(removeTabStop(formatting, 100), [p('a', null, 'Title'), p('b')], 1, 4)).toEqual([
      { tabStops: [] },
      null,
    ]);
  });
});
