// Text formatting on the writing (docs/specs/034-text-documents/text-and-paragraphs.md "Text formatting"): what a
// character's formatting is, through its styles and its own, and the commands that change it. A value equal to what
// the styles give is stored as no formatting of its own; over an empty selection the formatting at the caret is read
// and set, for the next characters typed. Each command is one transaction, so one undo step.
import type { Mark, MarkType, Node as PmNode } from 'prosemirror-model';
import { TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import {
  Styles,
  TEXT_PROPERTY_MARK_OF,
  TEXT_STYLE_MARK,
  type Style,
  type StyleDefaults,
  type TextProps,
} from '@livedoc/text-documents';
import { clampFontSize } from '@/lib/office/office-font-size';

/** What a character's formatting is read through. */
export type TextFormatting = { styles: readonly Style[]; defaults: StyleDefaults };

export type TextToggle = 'bold' | 'italic' | 'underline' | 'strike' | 'smallCaps';
export type TextProperty = keyof typeof TEXT_PROPERTY_MARK_OF;
export type Capitalisation = 'lowercase' | 'uppercase' | 'titleCase';

type Place = { paragraph: PmNode; marks: readonly Mark[] };
type Segment = Place & { from: number; to: number; text: string };

const markTypeOf = (state: EditorState, property: TextProperty): MarkType =>
  state.schema.marks[TEXT_PROPERTY_MARK_OF[property]]!;

const markValue = (marks: readonly Mark[], type: MarkType): unknown => {
  const mark = type.isInSet(marks);
  return mark ? (mark.attrs as { value: unknown }).value : undefined;
};

/** What the styles give a character in this paragraph with these marks. */
function inheritedAt(formatting: TextFormatting, { paragraph, marks }: Place): TextProps {
  const { styles, defaults } = formatting;
  const paragraphStyle =
    (paragraph.attrs as { style: string | null }).style ?? Styles.idOfRole(styles, 'normal');
  const textStyle = marks.find((m) => m.type.name === TEXT_STYLE_MARK);
  return Styles.textPropsOf(
    styles,
    defaults,
    paragraphStyle,
    textStyle ? ((textStyle.attrs as { id: unknown }).id as string) : undefined,
  );
}

// Absent reads as off, or on the baseline, so a stored value can be compared with what the styles give.
const TOGGLES: readonly TextProperty[] = ['bold', 'italic', 'underline', 'strike', 'smallCaps'];
const settled = (property: TextProperty, value: unknown): unknown =>
  value !== undefined
    ? value
    : property === 'vertical'
      ? 'baseline'
      : TOGGLES.includes(property)
        ? false
        : undefined;

function valueAt(
  state: EditorState,
  formatting: TextFormatting,
  place: Place,
  property: TextProperty,
) {
  const own = markValue(place.marks, markTypeOf(state, property));
  return settled(property, own !== undefined ? own : inheritedAt(formatting, place)[property]);
}

/** The text the selection covers, cut to it; none when it is empty. */
function segmentsOf(state: EditorState): Segment[] {
  const out: Segment[] = [];
  for (const range of state.selection.ranges) {
    const from = range.$from.pos;
    const to = range.$to.pos;
    state.doc.nodesBetween(from, to, (node, pos, parent) => {
      if (!node.isText || !parent) return;
      const start = Math.max(from, pos);
      const end = Math.min(to, pos + node.nodeSize);
      if (end > start)
        out.push({
          paragraph: parent,
          marks: node.marks,
          from: start,
          to: end,
          text: node.text!.slice(start - pos, end - pos),
        });
    });
  }
  return out;
}

const caretPlace = (state: EditorState): Place => ({
  paragraph: state.selection.$from.parent,
  marks: state.storedMarks ?? state.selection.$from.marks(),
});

/** The distinct values a property has over the selection, or at the caret when nothing is selected. */
export function textValuesOf(
  state: EditorState,
  formatting: TextFormatting,
  property: TextProperty,
): unknown[] {
  const segments = segmentsOf(state);
  const places: Place[] = segments.length > 0 ? segments : [caretPlace(state)];
  return [...new Set(places.map((place) => valueAt(state, formatting, place, property)))];
}

/** Whether every character of the selection (or the caret's formatting) has this toggle on. */
export function isToggleOn(state: EditorState, formatting: TextFormatting, toggle: TextToggle) {
  const values = textValuesOf(state, formatting, toggle);
  return values.length === 1 && values[0] === true;
}

/** The size the selection has, when it has one; null when mixed. */
export function textSizeOf(state: EditorState, formatting: TextFormatting): number | null {
  const values = textValuesOf(state, formatting, 'size');
  return values.length === 1 && typeof values[0] === 'number' ? values[0] : null;
}

/** Sets a property on every character of the selection (or at the caret) to `next` of its current value. */
function setProperty(
  formatting: TextFormatting,
  property: TextProperty,
  next: (current: unknown) => unknown,
): Command {
  return (state, dispatch) => {
    const type = markTypeOf(state, property);
    const decide = (place: Place): Mark | null => {
      const value = settled(property, next(valueAt(state, formatting, place, property)));
      const inherited = settled(property, inheritedAt(formatting, place)[property]);
      return value === inherited ? null : type.create({ value });
    };
    const tr: Transaction = state.tr;
    const segments = segmentsOf(state);
    if (segments.length === 0) {
      const place = caretPlace(state);
      const mark = decide(place);
      tr.setStoredMarks(mark ? mark.addToSet(place.marks) : type.removeFromSet(place.marks));
    } else
      for (const segment of segments) {
        const mark = decide(segment);
        if (mark) tr.addMark(segment.from, segment.to, mark);
        else tr.removeMark(segment.from, segment.to, type);
      }
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

/** Bold, italic, underline, strikethrough, small caps: off for all when every character has it, else on for all. */
export function toggleText(formatting: TextFormatting, toggle: TextToggle): Command {
  return (state, dispatch) => {
    const on = !isToggleOn(state, formatting, toggle);
    return setProperty(formatting, toggle, () => on)(state, dispatch);
  };
}

/** Superscript or subscript: one or the other; the one already on returns the text to the baseline. */
export function toggleVertical(formatting: TextFormatting, place: 'super' | 'sub'): Command {
  return (state, dispatch) => {
    const values = textValuesOf(state, formatting, 'vertical');
    const on = values.length === 1 && values[0] === place;
    return setProperty(formatting, 'vertical', () => (on ? 'baseline' : place))(state, dispatch);
  };
}

/** One size for every character of the selection, kept within 1 to 400 pt. */
export function setTextSize(formatting: TextFormatting, pt: number): Command {
  return setProperty(formatting, 'size', () => clampFontSize(pt));
}

/** Each character's size moved by `delta` points, kept within 1 to 400 pt; a mixed selection keeps its differences. */
export function stepTextSize(formatting: TextFormatting, delta: number): Command {
  return setProperty(formatting, 'size', (current) =>
    clampFontSize((typeof current === 'number' ? current : 11) + delta),
  );
}

const WORD = /[\p{L}\p{N}\p{M}'’]/u;

/** One character as the capitalisation writes it, given whether it starts a word. */
function recased(char: string, mode: Capitalisation, startsWord: boolean): string {
  if (mode === 'lowercase') return char.toLowerCase();
  if (mode === 'uppercase') return char.toUpperCase();
  return startsWord ? char.toUpperCase() : char.toLowerCase();
}

/**
 * Rewrites the selected characters' case, each keeping its formatting. A word may span runs of different formatting,
 * so words are read across the whole selection, starting from the character before it. Nothing selected: nothing.
 */
export function capitalise(mode: Capitalisation): Command {
  return (state, dispatch) => {
    const segments = segmentsOf(state);
    if (segments.length === 0) return false;
    const tr = state.tr;
    const first = segments[0]!;
    let previous =
      first.from > 0 ? state.doc.textBetween(first.from - 1, first.from, '\n', ' ') : '';
    const rewritten = segments.map((segment) => {
      let text = '';
      for (const char of segment.text) {
        text += recased(char, mode, !WORD.test(previous));
        previous = char;
      }
      return { segment, text };
    });
    // From the end, so earlier positions hold while later text changes length.
    for (const { segment, text } of rewritten.reverse())
      if (text !== segment.text)
        tr.replaceWith(segment.from, segment.to, state.schema.text(text, segment.marks));
    if (!tr.docChanged) return false;
    // The selection keeps the rewritten text, however its length changed.
    const { from, to } = state.selection;
    tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(from, -1), tr.mapping.map(to, 1)));
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}
