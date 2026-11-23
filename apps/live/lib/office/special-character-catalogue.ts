// The special characters catalogue, generated from Unicode's Character Database (docs/specs/034-text-documents/
// objects.md "Special characters"): every named character but controls, surrogates and private use, grouped by
// category and block, written compactly; and the ranges Unicode names by rule, found by codepoint only.
// Run by `pnpm chars:special`; the editor reads what it writes through special-characters.ts.

export const SPECIAL_CHARACTER_CATEGORIES = [
  'Symbol',
  'Punctuation',
  'Number',
  'Modifier',
  'Format & whitespace',
  'Scripts',
] as const;
export type SpecialCharacterCategory = (typeof SPECIAL_CHARACTER_CATEGORIES)[number];

/**
 * What the generator writes. A group's entries are one line each, `<step>|<name>[|<look>]`: the step from the previous
 * codepoint of the group (the first from 0) in base 36; the look `m` for a mark drawn on a dotted circle, or `=` and
 * the abbreviation a space or format character shows. A range is `[first, last, the name its codepoints take]`.
 */
export type SpecialCharactersWire = {
  readonly version: string;
  readonly groups: readonly (readonly [category: number, block: string, entries: string])[];
  readonly ranges: readonly (readonly [first: number, last: number, name: string])[];
};

type Block = { first: number; last: number; name: string };

const hex = (text: string) => Number.parseInt(text, 16);

/** `Blocks.txt`: `0000..007F; Basic Latin` lines, in codepoint order. */
export function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.split('\n')) {
    const match = /^([0-9A-F]+)\.\.([0-9A-F]+);\s*(.+?)\s*$/.exec(line);
    if (match) blocks.push({ first: hex(match[1]!), last: hex(match[2]!), name: match[3]! });
  }
  return blocks;
}

/** `NameAliases.txt`: each codepoint's first alias of type `abbreviation`. */
export function abbreviationsOf(text: string): Map<number, string> {
  const abbreviations = new Map<number, string>();
  for (const line of text.split('\n')) {
    const [cp, alias, type] = line.split(';');
    if (type?.trim() !== 'abbreviation' || !cp || !alias) continue;
    const at = hex(cp);
    if (!abbreviations.has(at)) abbreviations.set(at, alias);
  }
  return abbreviations;
}

/** The category a General_Category value falls in, inside a block; null for what is left out. */
export function categoryOf(general: string, block: string): SpecialCharacterCategory | null {
  if (/^(Sm|Sc|So)$/.test(general)) return 'Symbol';
  if (general.startsWith('P')) return 'Punctuation';
  if (general.startsWith('N')) return 'Number';
  if (general === 'Lm' || general === 'Sk') return 'Modifier';
  if (general.startsWith('M')) return block.includes('Combining') ? 'Modifier' : 'Scripts';
  if (general.startsWith('Z') || general === 'Cf') return 'Format & whitespace';
  if (general.startsWith('L')) return 'Scripts';
  // Controls, surrogates, private use and unassigned.
  return null;
}

/** The name a range's codepoints take, `<name>-<HEX>` (Unicode's rule NR2); Hangul syllables are named by rule NR1. */
export function rangeNameOf(label: string): string {
  if (label.startsWith('Hangul Syllable')) return 'HANGUL SYLLABLE';
  if (label.startsWith('CJK Ideograph')) return 'CJK UNIFIED IDEOGRAPH';
  return label.replace(/ (Extension \w+|Supplement)$/, '').toUpperCase();
}

// A space or format character with no abbreviation of Unicode's shows its name's initials (`EN QUAD` → EQ).
const initialsOf = (name: string) =>
  name
    .split(/[ -]+/)
    .map((word) => word[0])
    .join('');

function lookOf(cp: number, general: string, name: string, abbreviations: Map<number, string>) {
  if (general.startsWith('M')) return 'm';
  if (general.startsWith('Z') || general === 'Cf')
    return `=${abbreviations.get(cp) ?? initialsOf(name)}`;
  return '';
}

/** The catalogue of a version of `UnicodeData.txt`, `Blocks.txt` and `NameAliases.txt`. */
export function specialCharacterCatalogueOf({
  version,
  unicodeData,
  blocks: blocksText,
  nameAliases,
}: {
  version: string;
  unicodeData: string;
  blocks: string;
  nameAliases: string;
}): SpecialCharactersWire {
  const blocks = blocksOf(blocksText);
  const abbreviations = abbreviationsOf(nameAliases);
  const blockOf = (cp: number) => blocks.find((b) => cp >= b.first && cp <= b.last)?.name ?? '';
  // Groups in order of category, then block, then codepoint.
  const groups = new Map<
    string,
    { category: number; block: number; lines: string[]; at: number }
  >();
  const ranges: [number, number, string][] = [];
  let opened: { first: number; label: string } | null = null;
  for (const line of unicodeData.split('\n')) {
    const [cpText, name, general] = line.split(';');
    if (!cpText || !name || !general) continue;
    const cp = hex(cpText);
    const ranged = /^<(.+), (First|Last)>$/.exec(name);
    if (ranged) {
      if (ranged[2] === 'First') opened = { first: cp, label: ranged[1]! };
      else if (opened && categoryOf(general, '') !== null)
        ranges.push([opened.first, cp, rangeNameOf(opened.label)]);
      continue;
    }
    const block = blockOf(cp);
    const category = categoryOf(general, block);
    // `<control>` and the like carry no name of their own.
    if (category === null || name.startsWith('<')) continue;
    const categoryIndex = SPECIAL_CHARACTER_CATEGORIES.indexOf(category);
    const blockIndex = blocks.findIndex((b) => b.name === block);
    const key = `${categoryIndex}:${block}`;
    const group = groups.get(key) ?? {
      category: categoryIndex,
      block: blockIndex,
      lines: [],
      at: 0,
    };
    groups.set(key, group);
    const look = lookOf(cp, general, name, abbreviations);
    group.lines.push(`${(cp - group.at).toString(36)}|${name}${look ? `|${look}` : ''}`);
    group.at = cp;
  }
  const ordered = [...groups.values()].sort((a, b) => a.category - b.category || a.block - b.block);
  return {
    version,
    groups: ordered.map(
      (g) => [g.category, blocks[g.block]?.name ?? '', g.lines.join('\n')] as const,
    ),
    ranges,
  };
}
