// List styles (docs/specs/034-text-documents/lists.md "List styles"): Google's presets for each kind of list, their
// first levels repeating down the nine, and the preset a list matches by the look of its first three levels.
import { LIST_LEVELS, ListDefinition, type ListLevel, type NumberFormat } from './lists';

export type ListKind = ListLevel['kind'];

export type ListPreset = {
  readonly id: string;
  readonly kind: ListKind;
  /** Its markers at levels 0 to 2, as the grid names it ("1. a. i."); a checklist's by its strikethrough. */
  readonly name: string;
  readonly list: ListDefinition;
};

/** The levels a style's look is told by: the ones a preset draws in the grid. */
const LOOK_LEVELS = 3;

const indentOf = (level: number) => ({ indent: 36 * (level + 1), hanging: 18 });

const bullets = (id: string, cycle: readonly string[]): ListPreset => ({
  id,
  kind: 'bullet',
  name: cycle.join(' '),
  list: {
    levels: Array.from({ length: LIST_LEVELS }, (_, level) => ({
      kind: 'bullet' as const,
      bullet: cycle[level % cycle.length]!,
      ...indentOf(level),
    })),
  },
});

type NumberStep = { format: NumberFormat; label: (level: number) => string };
const suffixed =
  (suffix: string) =>
  (level: number): string =>
    `%${level + 1}${suffix}`;

const numbers = (id: string, name: string, cycle: readonly NumberStep[]): ListPreset => ({
  id,
  kind: 'number',
  name,
  list: {
    levels: Array.from({ length: LIST_LEVELS }, (_, level) => {
      const step = cycle[level % cycle.length]!;
      return {
        kind: 'number' as const,
        format: step.format,
        label: step.label(level),
        start: 1,
        ...indentOf(level),
      };
    }),
  },
});

const dotted = (format: NumberFormat): NumberStep => ({ format, label: suffixed('.') });
const parenthesised = (format: NumberFormat): NumberStep => ({ format, label: suffixed(')') });
// Every level's number shown, joined by dots: 1.1.1.
const outline: NumberStep = {
  format: 'decimal',
  label: (level) => `${Array.from({ length: level + 1 }, (_, i) => `%${i + 1}`).join('.')}.`,
};

const checks = (id: string, name: string, strike: boolean): ListPreset => ({
  id,
  kind: 'check',
  name,
  list: {
    levels: Array.from({ length: LIST_LEVELS }, (_, level) => ({
      kind: 'check' as const,
      ...(strike ? {} : { strikeChecked: false as const }),
      ...indentOf(level),
    })),
  },
});

export const LIST_PRESETS: readonly ListPreset[] = [
  numbers('numbered', '1. a. i.', [
    dotted('decimal'),
    dotted('lower-letter'),
    dotted('lower-roman'),
  ]),
  numbers('numbered-parenthesis', '1) a) i)', [
    parenthesised('decimal'),
    parenthesised('lower-letter'),
    parenthesised('lower-roman'),
  ]),
  numbers('numbered-outline', '1. 1.1. 1.1.1.', [outline]),
  numbers('numbered-upper-letter', 'A. a. i.', [
    dotted('upper-letter'),
    dotted('lower-letter'),
    dotted('lower-roman'),
  ]),
  numbers('numbered-upper-roman', 'I. A. 1.', [
    dotted('upper-roman'),
    dotted('upper-letter'),
    dotted('decimal'),
    dotted('lower-letter'),
    dotted('lower-roman'),
  ]),
  bullets('bulleted', ['●', '○', '■']),
  bullets('bulleted-diamond', ['❖', '➢', '■']),
  bullets('bulleted-arrow', ['➔', '○', '■']),
  bullets('bulleted-tick', ['✓', '○', '■']),
  bullets('bulleted-star', ['★', '○', '■']),
  bullets('bulleted-dash', ['-', '○', '■']),
  checks('checklist', 'With strikethrough', true),
  checks('checklist-plain', 'Without strikethrough', false),
];

// A level's look, without where it stands.
const lookOf = (level: ListLevel | undefined): string => {
  if (!level) return '';
  const { indent: _indent, hanging: _hanging, ...look } = level;
  return JSON.stringify(look, Object.keys(look).sort());
};

export const ListPresets = {
  /** A kind's presets, in Google's order, its default first. */
  of: (kind: ListKind): ListPreset[] => LIST_PRESETS.filter((p) => p.kind === kind),
  byId: (id: string): ListPreset | undefined => LIST_PRESETS.find((p) => p.id === id),
  /** The preset whose first three levels look as the list's do; null for a list of its own look. */
  matching: (list: ListDefinition | undefined): ListPreset | null => {
    if (!list) return null;
    const look = (l: ListDefinition) =>
      Array.from({ length: LOOK_LEVELS }, (_, i) => lookOf(l.levels[i])).join('|');
    const wanted = look(list);
    return LIST_PRESETS.find((p) => look(p.list) === wanted) ?? null;
  },
} as const;
