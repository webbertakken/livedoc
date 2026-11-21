// A format code as an ODF data style (docs/specs/029-sheets/standard-mapping.md "Number formats in the file", D93):
// each section a `number:*-style` of its own kind, the sections after the first chosen by `style:map` conditions as
// LibreOffice writes them, colours as text properties. The code itself rides as the main style's `number:title`, so a
// file LiveDoc wrote reads back to the same code (odf-number-styles-read.ts). Null for a code ODF cannot say.
import { escapeXmlAttribute, escapeXmlText } from '@livedoc/office-packages';
import { isDateSection, splitSections } from '../format-codes';

/** The colours a code names, as ODF's text properties hold them. */
export const CODE_COLOURS: Readonly<Record<string, string>> = {
  black: '#000000',
  blue: '#0000ff',
  cyan: '#00ffff',
  green: '#00ff00',
  magenta: '#ff00ff',
  red: '#ff0000',
  white: '#ffffff',
  yellow: '#ffff00',
};

type Section = { body: string; colour?: string; condition?: string };

const CONDITION = /^\[(<=|>=|<>|<|>|=)\s*(-?\d+(?:\.\d+)?)\]/;

// A section's leading brackets: a colour and a condition, in either order; null for a bracket ODF cannot say.
function sectionOf(text: string): Section | null {
  let body = text;
  const out: Section = { body };
  for (;;) {
    const condition = CONDITION.exec(body);
    if (condition) {
      out.condition = `value()${condition[1] === '<>' ? '!=' : condition[1]}${condition[2]}`;
      body = body.slice(condition[0].length);
      continue;
    }
    const colour = /^\[([A-Za-z]+)\]/.exec(body);
    if (colour && !/^[hms]+$/i.test(colour[1]!)) {
      const hex = CODE_COLOURS[colour[1]!.toLowerCase()];
      if (!hex) return null;
      out.colour = hex;
      body = body.slice(colour[0].length);
      continue;
    }
    return { ...out, body };
  }
}

type Part = { k: 'text'; v: string } | { k: 'fill'; v: string } | { k: 'code'; v: string };

// A section's parts: literal text (quoted, escaped, `_` widths as a space, a `[$£-809]` currency), fill characters,
// and the code between them.
function partsOf(body: string): Part[] {
  const parts: Part[] = [];
  const text = (v: string) => {
    const last = parts.at(-1);
    if (last?.k === 'text') last.v += v;
    else parts.push({ k: 'text', v });
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === '"') {
      const end = body.indexOf('"', i + 1);
      text(body.slice(i + 1, end < 0 ? body.length : end));
      i = end < 0 ? body.length : end;
    } else if (ch === '\\' || ch === '_') {
      text(ch === '_' ? ' ' : (body[i + 1] ?? ''));
      i++;
    } else if (ch === '*') {
      parts.push({ k: 'fill', v: body[i + 1] ?? ' ' });
      i++;
    } else if (body.startsWith('[$', i)) {
      const end = body.indexOf(']', i);
      text(body.slice(i + 2, end).split('-')[0]!);
      i = end;
    } else if (
      /[0#?,.%Ee+\-@dmyhsapDMYHSAP/:[\]]/.test(ch) &&
      !(ch === '-' && !/[Ee]$/.test(body.slice(0, i)))
    ) {
      const last = parts.at(-1);
      if (last?.k === 'code') last.v += ch;
      else parts.push({ k: 'code', v: ch });
    } else text(ch);
  }
  return parts;
}

const textXml = (v: string) => `<number:text>${escapeXmlText(v)}</number:text>`;

// A number's digits as ODF's number element: `#,##0.00` is grouped, one integer digit, two decimals.
function digitsXml(code: string): string | null {
  const scientific = /^([0#?,]*)(?:\.([0#?]*))?[Ee]\+?(0+)$/.exec(code);
  const plain = /^([0#?,]*)(?:\.([0#?]*))?$/.exec(code);
  const m = scientific ?? plain;
  if (!m || /,$/.test(m[1]!) || !/[0#?]/.test(code)) return null;
  const integer = m[1]!;
  const decimals = m[2] ?? '';
  const attrs = [
    `number:decimal-places="${decimals.length}"`,
    `number:min-decimal-places="${decimals.replace(/[#?]+$/, '').length}"`,
    `number:min-integer-digits="${integer.replace(/[^0]/g, '').length}"`,
  ];
  if (scientific)
    return `<number:scientific-number ${attrs.join(' ')} number:min-exponent-digits="${m[3]!.length}"/>`;
  return `<number:number ${attrs.join(' ')}${integer.includes(',') ? ' number:grouping="true"' : ''}/>`;
}

// The elements of a number section: texts around one number, a percent sign as text.
function numberSection(parts: Part[]): { kind: string; xml: string[] } | null {
  const codes = parts.filter((p) => p.k === 'code');
  if (codes.length > 1) return null;
  const percent = codes[0]?.v.includes('%') ?? false;
  const xml: string[] = [];
  for (const part of parts) {
    if (part.k === 'text') xml.push(textXml(part.v));
    else if (part.k === 'fill')
      xml.push(`<number:fill-character>${escapeXmlText(part.v)}</number:fill-character>`);
    else {
      const [before, digits = '', after = ''] = /^(%*)([^%]*)(%*)$/.exec(part.v)!.slice(1);
      if (before) xml.push(textXml(before));
      const number = digitsXml(digits);
      if (!number) return null;
      xml.push(number);
      if (after) xml.push(textXml(after));
    }
  }
  return { kind: percent ? 'percentage-style' : 'number-style', xml };
}

const DATE_PART = /^(\[h+\]|yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|am\/pm|a\/p|\.0+)/i;

// The elements of a date or time section; `m` after an hour or before a second is minutes.
function dateSection(parts: Part[]): { kind: string; xml: string[]; elapsed: boolean } | null {
  const tokens: Part[] = [];
  for (const part of parts) {
    if (part.k !== 'code') {
      tokens.push(part);
      continue;
    }
    let rest = part.v;
    while (rest) {
      const m = DATE_PART.exec(rest);
      if (m) tokens.push({ k: 'code', v: m[1]! });
      else tokens.push({ k: 'text', v: rest[0]! });
      rest = rest.slice(m ? m[1]!.length : 1);
    }
  }
  const xml: string[] = [];
  let date = false;
  let elapsed = false;
  const codeAt = (i: number, step: number) => {
    for (let j = i + step; j >= 0 && j < tokens.length; j += step)
      if (tokens[j]!.k === 'code') return tokens[j]!.v.toLowerCase();
    return '';
  };
  for (const [i, token] of tokens.entries()) {
    if (token.k === 'text') xml.push(textXml(token.v));
    if (token.k !== 'code') continue;
    const v = token.v.toLowerCase();
    const long = (n: number) => (v.length >= n ? ' number:style="long"' : '');
    const minutes = /^m{1,2}$/.test(v) && (/h/.test(codeAt(i, -1)) || /^s/.test(codeAt(i, 1)));
    if (/^\[h+\]$/.test(v)) {
      elapsed = true;
      xml.push(`<number:hours${v.length > 3 ? ' number:style="long"' : ''}/>`);
    } else if (minutes) xml.push(`<number:minutes${long(2)}/>`);
    else if (v === 'mmmmm') return null;
    else if (v.startsWith('m')) {
      date = true;
      xml.push(
        `<number:month${v.length >= 3 ? ' number:textual="true"' : ''}${v.length === 2 || v.length === 4 ? ' number:style="long"' : ''}/>`,
      );
    } else if (v.startsWith('y')) {
      date = true;
      xml.push(`<number:year${long(4)}/>`);
    } else if (v === 'ddd' || v === 'dddd') {
      date = true;
      xml.push(`<number:day-of-week${long(4)}/>`);
    } else if (v.startsWith('d')) {
      date = true;
      xml.push(`<number:day${long(2)}/>`);
    } else if (v.startsWith('h')) xml.push(`<number:hours${long(2)}/>`);
    else if (v.startsWith('s')) xml.push(`<number:seconds${long(2)}/>`);
    else if (v.startsWith('.')) {
      const seconds = xml.at(-1);
      if (!seconds?.startsWith('<number:seconds') || seconds.includes('decimal-places'))
        return null;
      xml[xml.length - 1] = seconds.replace('/>', ` number:decimal-places="${v.length - 1}"/>`);
    } else xml.push('<number:am-pm/>');
  }
  if (date && elapsed) return null;
  return { kind: date ? 'date-style' : 'time-style', xml, elapsed };
}

function textSection(parts: Part[]): { kind: string; xml: string[] } | null {
  const xml: string[] = [];
  for (const part of parts) {
    if (part.k === 'fill') return null;
    if (part.k === 'text') xml.push(textXml(part.v));
    else if (part.v === '@') xml.push('<number:text-content/>');
    else return null;
  }
  return { kind: 'text-style', xml };
}

// The conditions the sections after the first take, as a code's sections mean them without conditions of their own.
const DEFAULT_CONDITIONS: Readonly<Record<number, readonly string[]>> = {
  1: [],
  2: ['value()>=0'],
  3: ['value()>0', 'value()<0'],
  4: ['value()>0', 'value()<0', 'value()=0'],
};

/** A code as the data styles that say it: the main style named `name`, its sections `<name>P0`...; null when ODF cannot. */
export function dataStyleXml(name: string, code: string): string[] | null {
  const texts = splitSections(code);
  const sections = texts.map(sectionOf);
  if (sections.some((s) => s === null)) return null;
  const all = sections as Section[];
  const explicit = all.some((s) => s.condition !== undefined);
  const conditions = explicit
    ? all.slice(0, -1).map((s) => s.condition)
    : DEFAULT_CONDITIONS[all.length]!;
  if (conditions.some((c) => c === undefined)) return null;
  const styles: string[] = [];
  for (const [i, section] of all.entries()) {
    const parts = partsOf(section.body);
    const isText = parts.some((p) => p.k === 'code' && p.v.includes('@'));
    const made = isText
      ? textSection(parts)
      : isDateSection(section.body)
        ? dateSection(parts)
        : numberSection(parts);
    if (!made) return null;
    const main = i === all.length - 1;
    const own = main ? name : `${name}P${i}`;
    const attrs = [
      `style:name="${own}"`,
      ...(main ? [`number:title="${escapeXmlAttribute(code)}"`] : []),
      ...('elapsed' in made && made.elapsed ? ['number:truncate-on-overflow="false"'] : []),
    ];
    const maps = main
      ? conditions.map(
          (c, k) =>
            `<style:map style:condition="${escapeXmlAttribute(c!)}" style:apply-style-name="${name}P${k}"/>`,
        )
      : [];
    const colour = section.colour ? [`<style:text-properties fo:color="${section.colour}"/>`] : [];
    styles.push(
      `<number:${made.kind} ${attrs.join(' ')}>${[...colour, ...made.xml, ...maps].join('')}</number:${made.kind}>`,
    );
  }
  return styles;
}
