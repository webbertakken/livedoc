// A paragraph's own formatting (docs/specs/034-text-documents/text-and-paragraphs.md "Alignment and indents"): what a
// paragraph draws with, its own over its style's, and the commands that change it on every paragraph the selection
// touches. A value equal to the style's is stored as none of the paragraph's own; each command is one transaction.
import type { Node as PmNode } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import { canonical, PLAIN_LOOK, Styles, type ParagraphProps } from '@livedoc/text-documents';
import type { TextFormatting } from './text-document-formatting';
import { selectedParagraphs } from './text-document-paragraphs';

export type Alignment = NonNullable<ParagraphProps['align']>;

/** One step of Increase and Decrease indent: 0.5 in. */
export const INDENT_STEP_PT = 36;
/** The farthest Increase indent goes: a letter page's line (6.5 in) less one step (default). */
export const INDENT_MAX_PT = 432;

const ownOf = (node: PmNode): ParagraphProps =>
  (node.attrs as { props: ParagraphProps | null }).props ?? {};

/** What the paragraph's style gives it. */
function inheritedOf(node: PmNode, { styles, defaults }: TextFormatting): ParagraphProps {
  const style = (node.attrs as { style: string | null }).style ?? Styles.idOfRole(styles, 'normal');
  return Styles.paragraphPropsOf(styles, defaults, style);
}

// An unset value reads as its plain one, so a value can be compared with what the style gives.
const settled = <K extends keyof ParagraphProps>(key: K, value: ParagraphProps[K]): unknown =>
  value ?? (PLAIN_LOOK.paragraph as Partial<ParagraphProps>)[key];

/** The paragraph formatting a paragraph draws with: its own over its style's, every look value settled. */
export function paragraphPropsOf(node: PmNode, formatting: TextFormatting): ParagraphProps {
  return { ...PLAIN_LOOK.paragraph, ...inheritedOf(node, formatting), ...ownOf(node) };
}

/**
 * Sets values on every paragraph the selection touches, each from what it draws with now; a value equal to the
 * style's, or left undefined, is stored as none of its own, and a paragraph left with none holds no own formatting.
 */
export function setParagraphProps(
  formatting: TextFormatting,
  next: (drawn: ParagraphProps) => Partial<ParagraphProps>,
): Command {
  return (state, dispatch) => {
    const tr = state.tr;
    for (const { node, pos } of selectedParagraphs(state)) {
      const inherited = inheritedOf(node, formatting);
      const own: Record<string, unknown> = { ...ownOf(node) };
      for (const [key, value] of Object.entries(next(paragraphPropsOf(node, formatting)))) {
        const k = key as keyof ParagraphProps;
        // Left out (undefined): none of its own, so its style's shows.
        if (
          value === undefined ||
          canonical(settled(k, value as never)) === canonical(settled(k, inherited[k]))
        )
          delete own[key];
        else own[key] = value;
      }
      const props = Object.keys(own).length > 0 ? own : null;
      if (canonical(props) !== canonical((node.attrs as { props: unknown }).props ?? null))
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, props });
    }
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

/** The value a paragraph property has over the paragraphs the selection touches; null when they differ. */
function sharedValue<K extends keyof ParagraphProps>(
  state: EditorState,
  formatting: TextFormatting,
  key: K,
): ParagraphProps[K] | null {
  const values = selectedParagraphs(state).map((p) => paragraphPropsOf(p.node, formatting)[key]);
  const first = values[0];
  return values.length > 0 && values.every((v) => canonical(v) === canonical(first)) ? first : null;
}

/** The alignment of the paragraphs the selection touches; null when they differ. */
export function alignmentOf(state: EditorState, formatting: TextFormatting): Alignment | null {
  return sharedValue(state, formatting, 'align') ?? null;
}

export const setAlignment = (formatting: TextFormatting, align: Alignment): Command =>
  setParagraphProps(formatting, () => ({ align }));

/** Increase (+) or Decrease (−) indent, from where each paragraph is, held between 0 and INDENT_MAX_PT. */
export const stepIndent = (formatting: TextFormatting, delta: number): Command =>
  setParagraphProps(formatting, (drawn) => ({
    indentStart: Math.min(INDENT_MAX_PT, Math.max(0, (drawn.indentStart ?? 0) + delta)),
  }));

export type Indents = {
  /** Points, or null where the paragraphs differ. */
  start: number | null;
  end: number | null;
  /** The first line's indent relative to the rest: positive first line, negative hanging. */
  first: number | null;
};

/** The indents the paragraphs the selection touches have, each null where they differ. */
export function indentsOf(state: EditorState, formatting: TextFormatting): Indents {
  return {
    start: sharedValue(state, formatting, 'indentStart') ?? null,
    end: sharedValue(state, formatting, 'indentEnd') ?? null,
    first: sharedValue(state, formatting, 'indentFirst') ?? null,
  };
}

/** Sets the indents given (points); one left out (null) keeps each paragraph's own. */
export const setIndents = (formatting: TextFormatting, indents: Indents): Command =>
  setParagraphProps(formatting, () => ({
    ...(indents.start !== null ? { indentStart: indents.start } : {}),
    ...(indents.end !== null ? { indentEnd: indents.end } : {}),
    ...(indents.first !== null ? { indentFirst: indents.first } : {}),
  }));

// Spacing and keep rules (text-and-paragraphs.md "Spacing and keep rules").

export type LineSpacing = { readonly item: string; readonly label: string; readonly value: number };

export const LINE_SPACINGS: readonly LineSpacing[] = [
  { item: 'spacing-single', label: 'Single', value: 1 },
  { item: 'spacing-115', label: '1.15', value: 1.15 },
  { item: 'spacing-15', label: '1.5', value: 1.5 },
  { item: 'spacing-double', label: 'Double', value: 2 },
];

/** What Add space before (or after) paragraph adds: 12 pt (default). */
export const PARAGRAPH_SPACE_PT = 12;

/** The multiple the paragraphs' lines are spaced by; null for a spacing in points or when they differ. */
export function lineSpacingOf(state: EditorState, formatting: TextFormatting): number | null {
  const height = sharedValue(state, formatting, 'lineHeight');
  return height?.rule === 'multiple' ? height.value : null;
}

export const setLineSpacing = (formatting: TextFormatting, value: number): Command =>
  setParagraphProps(formatting, () => ({ lineHeight: { rule: 'multiple', value } }));

export type SpaceSide = 'spaceBefore' | 'spaceAfter';

/** The space the paragraphs have before (or after) them, points; null when they differ. */
export function spaceOf(state: EditorState, formatting: TextFormatting, side: SpaceSide) {
  return sharedValue(state, formatting, side) ?? null;
}

/** Add space where every paragraph has none; else remove it from all. */
export const toggleSpace =
  (formatting: TextFormatting, side: SpaceSide): Command =>
  (state, dispatch) =>
    setParagraphProps(formatting, () => ({
      [side]: spaceOf(state, formatting, side) === 0 ? PARAGRAPH_SPACE_PT : 0,
    }))(state, dispatch);

export type Spacing = {
  /** A multiple, or null where the paragraphs differ (or space their lines in points). */
  lineHeight: number | null;
  before: number | null;
  after: number | null;
};

export const spacingOf = (state: EditorState, formatting: TextFormatting): Spacing => ({
  lineHeight: lineSpacingOf(state, formatting),
  before: spaceOf(state, formatting, 'spaceBefore'),
  after: spaceOf(state, formatting, 'spaceAfter'),
});

/** Sets the spacing given; one left out (null) keeps each paragraph's own. */
export const setSpacing = (formatting: TextFormatting, spacing: Spacing): Command =>
  setParagraphProps(formatting, () => ({
    ...(spacing.lineHeight !== null
      ? { lineHeight: { rule: 'multiple', value: spacing.lineHeight } as const }
      : {}),
    ...(spacing.before !== null ? { spaceBefore: spacing.before } : {}),
    ...(spacing.after !== null ? { spaceAfter: spacing.after } : {}),
  }));

export type KeepKey = 'keepWithNext' | 'keepTogether' | 'widowControl';

export const KEEP_RULES: readonly { readonly item: string; readonly key: KeepKey }[] = [
  { item: 'keep-with-next', key: 'keepWithNext' },
  { item: 'keep-lines-together', key: 'keepTogether' },
  { item: 'prevent-single-lines', key: 'widowControl' },
];

/** Whether every paragraph the selection touches has the rule. */
export const isKeepOn = (state: EditorState, formatting: TextFormatting, key: KeepKey): boolean =>
  sharedValue(state, formatting, key) === true;

/** On for all unless all have it, then off for all. */
export const toggleKeep =
  (formatting: TextFormatting, key: KeepKey): Command =>
  (state, dispatch) =>
    setParagraphProps(formatting, () => ({ [key]: !isKeepOn(state, formatting, key) }))(
      state,
      dispatch,
    );
