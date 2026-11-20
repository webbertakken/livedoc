// A paragraph style's look (docs/specs/034-text-documents/text-and-paragraphs.md "A style's look"): the formatting it
// draws its paragraphs in, through its parents and the defaults, every property settled to a value. Restyling sets
// looks on the styles asked for and keeps every other paragraph style looking as it did, as Google's styles stand
// alone ("Update to match", "Default styles").
import { canonical, compact, type ParagraphProps, type TextProps } from './props';
import { Styles, type Style, type StyleDefaults, type StyleRole } from './styles';

export const LOOK_TEXT_KEYS = [
  'font',
  'size',
  'bold',
  'italic',
  'underline',
  'strike',
  'smallCaps',
  'transform',
  'color',
] as const satisfies readonly (keyof TextProps)[];

export const LOOK_PARAGRAPH_KEYS = [
  'align',
  'indentStart',
  'indentEnd',
  'indentFirst',
  'spaceBefore',
  'spaceAfter',
  'lineHeight',
  'keepWithNext',
  'keepTogether',
  'widowControl',
] as const satisfies readonly (keyof ParagraphProps)[];

type LookTextKey = (typeof LOOK_TEXT_KEYS)[number];
type LookParagraphKey = (typeof LOOK_PARAGRAPH_KEYS)[number];

export type StyleLook = {
  readonly text: Required<Pick<TextProps, LookTextKey>>;
  readonly paragraph: Required<Pick<ParagraphProps, LookParagraphKey>>;
};

/** What a property the look leaves unset reads as (text-and-paragraphs.md "A style's look", default). */
export const PLAIN_LOOK: StyleLook = {
  text: {
    font: 'Arial',
    size: 11,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    smallCaps: false,
    transform: 'none',
    color: '#000000',
  },
  paragraph: {
    align: 'start',
    indentStart: 0,
    indentEnd: 0,
    indentFirst: 0,
    spaceBefore: 0,
    spaceAfter: 0,
    lineHeight: { rule: 'multiple', value: 1 },
    keepWithNext: false,
    keepTogether: false,
    widowControl: false,
  },
};

function settle<K extends string>(
  props: Partial<Record<K, unknown>>,
  keys: readonly K[],
  plain: Record<K, unknown>,
): Record<K, unknown> {
  const out = {} as Record<K, unknown>;
  for (const key of keys) out[key] = props[key] ?? plain[key];
  return out;
}

const lowerColour = (text: Record<string, unknown>) =>
  typeof text.color === 'string' ? { ...text, color: text.color.toLowerCase() } : text;

const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** The look's values that differ from `now`'s, by key. */
function differences<T extends object>(look: T, under: T, keys: readonly (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const key of keys) if (!same(look[key], under[key])) out[key] = look[key];
  return out;
}

/** The look's values a style sets as its own: those its parent does not give, and those it already sets. */
function ownOf<T extends object>(
  look: T,
  under: T,
  own: object,
  keys: readonly (keyof T)[],
): Partial<T> {
  const out: Partial<T> = {};
  for (const key of keys)
    if (key in compact(own) || !same(look[key], under[key])) out[key] = look[key];
  return out;
}

/** The props without the look's keys: what a style holds beyond its look (a highlight, the outline level). */
function beyondLook<T extends object>(props: T, keys: readonly string[]): T {
  return Object.fromEntries(Object.entries(compact(props)).filter(([k]) => !keys.includes(k))) as T;
}

/** Paragraph styles with every parent before its children; a cycle is cut where it closes. */
function parentsFirst(styles: readonly Style[]): Style[] {
  const out: Style[] = [];
  const placed = new Set<string>();
  const visiting = new Set<string>();
  const place = (style: Style) => {
    if (placed.has(style.id) || visiting.has(style.id)) return;
    visiting.add(style.id);
    const parent = Styles.byId(styles, style.parent);
    if (parent) place(parent);
    visiting.delete(style.id);
    placed.add(style.id);
    if (style.family === 'paragraph') out.push(style);
  };
  styles.forEach(place);
  return out;
}

export const StyleLooks = {
  /** A paragraph style's look, through its parents and the defaults; the defaults alone for none or one not held. */
  of: (styles: readonly Style[], defaults: StyleDefaults, id: string | undefined): StyleLook => ({
    text: lowerColour(
      settle(Styles.textPropsOf(styles, defaults, id), LOOK_TEXT_KEYS, PLAIN_LOOK.text),
    ) as StyleLook['text'],
    paragraph: settle(
      Styles.paragraphPropsOf(styles, defaults, id),
      LOOK_PARAGRAPH_KEYS,
      PLAIN_LOOK.paragraph,
    ) as StyleLook['paragraph'],
  }),

  /**
   * The styles to write so each role asked for draws in its look and every other paragraph style keeps the look it
   * has: a role the document lacks is added from the format's set; a style whose look already holds is left out.
   */
  restyle: (
    styles: readonly Style[],
    defaults: StyleDefaults,
    format: 'odf' | 'ooxml',
    targets: Partial<Record<StyleRole, StyleLook>>,
  ): Style[] => {
    const roles = Object.keys(targets) as StyleRole[];
    const added = Styles.builtIn(format).filter(
      (s) => roles.includes(s.role!) && !Styles.idOfRole(styles, s.role!),
    );
    let working: Style[] = [...styles, ...added];
    const before = new Map(working.map((s) => [s.id, StyleLooks.of(working, defaults, s.id)]));
    const changed = new Map<string, Style>(added.map((s) => [s.id, s]));
    for (const style of parentsFirst(working)) {
      const current = Styles.byId(working, style.id)!;
      const asked = current.role ? targets[current.role] : undefined;
      const target = asked ?? before.get(current.id)!;
      const under = StyleLooks.of(working, defaults, current.parent);
      const now = StyleLooks.of(working, defaults, current.id);
      let next: Style;
      if (asked)
        next = {
          ...current,
          text: {
            ...beyondLook(current.text, LOOK_TEXT_KEYS),
            ...ownOf(target.text, under.text, current.text, LOOK_TEXT_KEYS),
          },
          paragraph: {
            ...beyondLook(current.paragraph, LOOK_PARAGRAPH_KEYS),
            ...ownOf(target.paragraph, under.paragraph, current.paragraph, LOOK_PARAGRAPH_KEYS),
          },
        };
      else
        next = {
          ...current,
          text: { ...current.text, ...differences(target.text, now.text, LOOK_TEXT_KEYS) },
          paragraph: {
            ...current.paragraph,
            ...differences(target.paragraph, now.paragraph, LOOK_PARAGRAPH_KEYS),
          },
        };
      if (same(next.text, current.text) && same(next.paragraph, current.paragraph)) continue;
      working = working.map((s) => (s.id === next.id ? next : s));
      changed.set(next.id, next);
    }
    return working.filter((s) => changed.has(s.id));
  },
} as const;
