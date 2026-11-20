// What the ruler reads and sets (docs/specs/034-text-documents/editing-surface.md "The ruler"): the indents and tab
// stops of the paragraph at the selection's start, set by a drag or a press on every paragraph the selection touches,
// each one undo step. Lengths are points from the text area's start.
import type { Command, EditorState } from 'prosemirror-state';
import { TabStops, type TabAlign, type TabStop } from '@livedoc/text-documents';
import type { TextFormatting } from './text-document-formatting';
import { paragraphPropsOf, setParagraphProps } from './text-document-paragraph-formatting';
import { selectedParagraphs } from './text-document-paragraphs';

/** The left and right indents keep at least this far apart: half an inch (default). */
export const INDENT_GAP_PT = 36;
/** A tab stop dragged this far above or below the ruler is taken away when let go (default). */
export const REMOVE_DISTANCE_PX = 24;

export type RulerReading = {
  readonly indentStart: number;
  readonly indentFirst: number;
  readonly indentEnd: number;
  readonly stops: readonly TabStop[];
};

export type IndentMarker = 'left' | 'first' | 'right';

/** The indents and stops of the paragraph at the selection's start; none before there is one. */
export function rulerReading(state: EditorState, formatting: TextFormatting): RulerReading {
  const first = selectedParagraphs(state)[0];
  const props = first ? paragraphPropsOf(first.node, formatting) : {};
  return {
    indentStart: props.indentStart ?? 0,
    indentFirst: props.indentFirst ?? 0,
    indentEnd: props.indentEnd ?? 0,
    stops: props.tabStops ?? [],
  };
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));

/**
 * An indent marker let go at `at`: the left indent (the first line moving with it), the first line alone, or the right
 * indent, each held within the text area and the left and right indents `INDENT_GAP_PT` apart.
 */
export function setRulerIndent(
  formatting: TextFormatting,
  marker: IndentMarker,
  at: number,
  textWidth: number,
): Command {
  return setParagraphProps(formatting, (drawn) => {
    const start = drawn.indentStart ?? 0;
    const end = drawn.indentEnd ?? 0;
    if (marker === 'left') return { indentStart: clamp(at, 0, textWidth - end - INDENT_GAP_PT) };
    if (marker === 'first') return { indentFirst: clamp(at, 0, textWidth - end) - start };
    return { indentEnd: clamp(textWidth - at, 0, textWidth - start - INDENT_GAP_PT) };
  });
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.05;

/** Adds a stop at `at` to every paragraph the selection touches, over any at that place. */
export const addTabStop = (formatting: TextFormatting, align: TabAlign, at: number): Command =>
  setParagraphProps(formatting, (drawn) => ({
    tabStops: TabStops.normalise([
      ...(drawn.tabStops ?? []).filter((s) => !near(s.position, at)),
      { position: at, align },
    ]).stops,
  }));

/** Moves the stop at `from` to `to` in every paragraph the selection touches that has it. */
export const moveTabStop = (formatting: TextFormatting, from: number, to: number): Command =>
  setParagraphProps(formatting, (drawn) => {
    const stops = drawn.tabStops ?? [];
    const moving = stops.find((s) => near(s.position, from));
    if (!moving) return {};
    return {
      tabStops: TabStops.normalise([
        ...stops.filter((s) => s !== moving && !near(s.position, to)),
        { ...moving, position: to },
      ]).stops,
    };
  });

/** Takes the stop at `at` away from every paragraph the selection touches. */
export const removeTabStop = (formatting: TextFormatting, at: number): Command =>
  setParagraphProps(formatting, (drawn) => {
    const stops = drawn.tabStops ?? [];
    return stops.some((s) => near(s.position, at))
      ? { tabStops: stops.filter((s) => !near(s.position, at)) }
      : {};
  });
