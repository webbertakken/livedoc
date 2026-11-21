// An ODF data style read as a format code (docs/specs/029-sheets/standard-mapping.md "Number formats in the file",
// D93): each `number:*-style` a section, its `style:map` conditions putting the sections in a code's order. A style
// whose `number:title` is a code that writes this very structure is that code (a file LiveDoc wrote); any other is
// read from its structure, and what a code cannot say (an era, a quarter, a colour of no name) makes it approximate.
import { attributeOf, childElements, ODF_NS, type XmlElement } from '@livedoc/office-packages';
import { CODE_COLOURS, dataStyleXml } from './odf-number-styles';

const { number: NUMBER, style: STYLE, fo: FO } = ODF_NS;

/** A data style read: its code, and whether something it held is not in it. */
export type DataStyleRead = { code: string; approximate: boolean };

const NAMED_COLOURS = new Map(
  Object.entries(CODE_COLOURS).map(([name, hex]) => [hex, `[${name[0]!.toUpperCase()}${name.slice(1)}]`]),
);

// Characters a code shows as they are, unquoted, in a number section and in a date or time one.
const BARE_IN_NUMBER = /^[ \-()]+$/;
const BARE_IN_DATE = /^[ \-/:.,]+$/;

// Text as a code holds it: bare where a code shows it as it is, else quoted, a quote inside escaped.
function quoted(text: string, bare: RegExp): string {
  if (text === '' || bare.test(text)) return text;
  return text.includes('"') ? [...text].map((ch) => `\\${ch}`).join('') : `"${text}"`;
}

function digits(element: XmlElement): string {
  const attr = (local: string) => Number(attributeOf(element, NUMBER, local) ?? 0);
  const places = attr('decimal-places');
  const min = Math.min(attributeOf(element, NUMBER, 'min-decimal-places') === undefined ? places : attr('min-decimal-places'), places);
  const integer = attr('min-integer-digits');
  const grouped = attributeOf(element, NUMBER, 'grouping') === 'true';
  let whole = '0'.repeat(integer) || '#';
  if (grouped) whole = `${'#'.repeat(Math.max(0, 4 - whole.length))}${whole}`.replace(/(.)(...)$/, '$1,$2');
  const decimals = places > 0 ? `.${'0'.repeat(min)}${'#'.repeat(places - min)}` : '';
  return `${whole}${decimals}`;
}

// One data style's own section, without its maps; `approximate` set when a part has no code.
function sectionCode(style: XmlElement, flags: { approximate: boolean }): string {
  const elapsed = attributeOf(style, NUMBER, 'truncate-on-overflow') === 'false';
  const bare = style.local === 'date-style' || style.local === 'time-style' ? BARE_IN_DATE : BARE_IN_NUMBER;
  let out = '';
  for (const child of childElements(style)) {
    const long = attributeOf(child, NUMBER, 'style') === 'long';
    const text = child.children.filter((c): c is string => typeof c === 'string').join('');
    if (child.uri === STYLE && child.local === 'text-properties') {
      const colour = attributeOf(child, FO, 'color')?.toLowerCase();
      const named = colour && NAMED_COLOURS.get(colour);
      if (named) out = `${named}${out}`;
      else if (colour) flags.approximate = true;
      continue;
    }
    if (child.uri === STYLE && child.local === 'map') continue;
    if (child.uri !== NUMBER) continue;
    switch (child.local) {
      case 'text':
        out += style.local === 'percentage-style' && text === '%' ? '%' : quoted(text, bare);
        break;
      case 'currency-symbol':
        out += quoted(text, bare);
        break;
      case 'fill-character':
        out += `*${text || ' '}`;
        break;
      case 'number':
        if (childElements(child).length > 0) flags.approximate = true;
        out += digits(child);
        break;
      case 'scientific-number':
        out += `${digits(child)}E+${'0'.repeat(Number(attributeOf(child, NUMBER, 'min-exponent-digits') ?? 2))}`;
        break;
      case 'text-content':
        out += '@';
        break;
      case 'day':
        out += long ? 'dd' : 'd';
        break;
      case 'day-of-week':
        out += long ? 'dddd' : 'ddd';
        break;
      case 'month': {
        const textual = attributeOf(child, NUMBER, 'textual') === 'true';
        out += textual ? (long ? 'mmmm' : 'mmm') : long ? 'mm' : 'm';
        break;
      }
      case 'year':
        out += long ? 'yyyy' : 'yy';
        break;
      case 'hours':
        out += elapsed ? (long ? '[hh]' : '[h]') : long ? 'hh' : 'h';
        break;
      case 'minutes':
        out += long ? 'mm' : 'm';
        break;
      case 'seconds': {
        const places = Number(attributeOf(child, NUMBER, 'decimal-places') ?? 0);
        out += `${long ? 'ss' : 's'}${places > 0 ? `.${'0'.repeat(places)}` : ''}`;
        break;
      }
      case 'am-pm':
        out += 'AM/PM';
        break;
      default:
        // An era, a quarter, a week of the year, a fraction, a boolean: no code says them here.
        flags.approximate = true;
    }
  }
  return out;
}

const CONDITION = /^value\(\)\s*(<=|>=|!=|<|>|=)\s*(-?\d+(?:\.\d+)?)$/;

// The conditions a code's sections mean without saying them, by how many sections there are.
const IMPLIED: readonly string[][] = [
  [],
  ['>=0'],
  ['>0', '<0'],
  ['>0', '<0', '=0'],
];

/** A data style as a code, its sections found through `styles` (every data style by name); null when none. */
export function readDataStyle(
  style: XmlElement,
  styles: ReadonlyMap<string, XmlElement>,
): DataStyleRead | null {
  const flags = { approximate: false };
  const maps = childElements(style).filter((c) => c.uri === STYLE && c.local === 'map');
  const sections: string[] = [];
  const conditions: string[] = [];
  for (const map of maps) {
    const target = styles.get(attributeOf(map, STYLE, 'apply-style-name') ?? '');
    const condition = CONDITION.exec(attributeOf(map, STYLE, 'condition') ?? '');
    if (!target || !condition) {
      flags.approximate = true;
      continue;
    }
    conditions.push(`${condition[1] === '!=' ? '<>' : condition[1]}${condition[2]}`);
    sections.push(sectionCode(target, flags));
  }
  const main = sectionCode(style, flags);
  const implied = conditions.join(',') === IMPLIED[conditions.length]?.join(',');
  const code = [
    ...sections.map((section, i) => (implied ? section : `[${conditions[i]}]${section}`)),
    main,
  ].join(';');
  if (code === '') return null;
  // A code LiveDoc wrote rides as the title; it holds when it writes this very structure.
  const title = attributeOf(style, NUMBER, 'title');
  if (title && !flags.approximate) {
    const name = 'N';
    const fromTitle = dataStyleXml(name, title);
    const fromCode = dataStyleXml(name, code);
    if (fromTitle && fromCode && fromTitle.join('').replace(/ number:title="[^"]*"/, '') === fromCode.join('').replace(/ number:title="[^"]*"/, ''))
      return { code: title, approximate: false };
  }
  return { code, approximate: flags.approximate };
}
