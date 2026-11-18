// ODF list styles (standard-mapping.md "Lists"): `text:list-style` and its level styles read into a list definition
// and written from one. A checklist is a level whose bullet is a box (`☐`, `☑`).
import {
  attributeOf,
  childElements,
  escapeXmlAttribute,
  odfLengthToPt,
  ptToOdf,
  type XmlElement,
} from '@livedoc/office-packages';
import {
  CHECK_MARKS,
  LIST_LEVELS,
  type ListDefinition,
  type ListLevel,
  type NumberFormat,
} from '../model/lists';
import { compact } from '../model/props';
import { NS } from './odf-names';

const FORMAT_IN: Record<string, NumberFormat> = {
  '1': 'decimal',
  a: 'lower-letter',
  A: 'upper-letter',
  i: 'lower-roman',
  I: 'upper-roman',
};
const FORMAT_OUT: Record<NumberFormat, string> = {
  decimal: '1',
  'lower-letter': 'a',
  'upper-letter': 'A',
  'lower-roman': 'i',
  'upper-roman': 'I',
};

function indents(level: XmlElement): { indent?: number; hanging?: number } {
  const props = childElements(level).find(
    (c) => c.uri === NS.style && c.local === 'list-level-properties',
  );
  const alignment =
    props && childElements(props).find((c) => c.local === 'list-level-label-alignment');
  if (!alignment) return {};
  const margin = odfLengthToPt(attributeOf(alignment, NS.fo, 'margin-left'));
  const first = odfLengthToPt(attributeOf(alignment, NS.fo, 'text-indent'));
  return compact({ indent: margin, hanging: first === undefined ? undefined : -first });
}

/** The label of a numbered level: its prefix, the numbers of the levels it shows, its suffix. */
function label(level: XmlElement, at: number): string {
  const shown = Math.max(
    1,
    Math.min(at + 1, Number(attributeOf(level, NS.text, 'display-levels') ?? '1') || 1),
  );
  const numbers = Array.from({ length: shown }, (_, i) => `%${at + 2 - shown + i}`).join('.');
  return `${attributeOf(level, NS.style, 'num-prefix') ?? ''}${numbers}${attributeOf(level, NS.style, 'num-suffix') ?? ''}`;
}

/** A list style's nine levels; levels it does not define are bullets. */
export function readListLevels(style: XmlElement): ListLevel[] {
  const levels: ListLevel[] = Array.from({ length: LIST_LEVELS }, () => ({
    kind: 'bullet',
    bullet: '•',
  }));
  for (const child of childElements(style)) {
    const at = Number(attributeOf(child, NS.text, 'level')) - 1;
    if (!(at >= 0 && at < LIST_LEVELS)) continue;
    if (child.local === 'list-level-style-number') {
      const format = FORMAT_IN[attributeOf(child, NS.style, 'num-format') ?? ''];
      levels[at] = format
        ? {
            kind: 'number',
            format,
            label: label(child, at),
            start: Number(attributeOf(child, NS.text, 'start-value') ?? '1') || 1,
            ...indents(child),
          }
        : { kind: 'bullet', bullet: '', ...indents(child) };
    } else if (child.local === 'list-level-style-bullet') {
      const bullet = attributeOf(child, NS.text, 'bullet-char') ?? '•';
      levels[at] =
        bullet === CHECK_MARKS.open || bullet === CHECK_MARKS.done
          ? { kind: 'check', ...indents(child) }
          : { kind: 'bullet', bullet, ...indents(child) };
    }
  }
  return levels;
}

const attr = (name: string, value: string | undefined) =>
  value === undefined ? '' : ` ${name}="${escapeXmlAttribute(value)}"`;

function levelPropsXml(level: ListLevel, at: number): string {
  const indent = level.indent ?? 36 * (at + 1);
  const hanging = level.hanging ?? 18;
  return `<style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${ptToOdf(indent)}" fo:text-indent="${ptToOdf(-hanging)}" fo:margin-left="${ptToOdf(indent)}"/></style:list-level-properties>`;
}

function numberParts(level: Extract<ListLevel, { kind: 'number' }>, at: number) {
  const match = level.label.match(/^(.*?)((?:%\d)(?:\.%\d)*)(.*)$/);
  const prefix = match?.[1] ?? '';
  const shown = match ? match[2]!.split('.').length : 1;
  const suffix = match ? match[3]! : level.label;
  return { prefix, suffix, shown: Math.min(shown, at + 1) };
}

/** A `text:list-style` for a definition, named `name`. */
export function listStyleXml(name: string, list: ListDefinition): string {
  const levels = list.levels.map((level, at) => {
    const n = at + 1;
    if (level.kind === 'number') {
      const { prefix, suffix, shown } = numberParts(level, at);
      return `<text:list-level-style-number text:level="${n}"${attr('style:num-prefix', prefix || undefined)}${attr('style:num-suffix', suffix || undefined)} style:num-format="${FORMAT_OUT[level.format]}"${shown > 1 ? ` text:display-levels="${shown}"` : ''}${level.start === 1 ? '' : ` text:start-value="${level.start}"`}>${levelPropsXml(level, at)}</text:list-level-style-number>`;
    }
    const bullet = level.kind === 'check' ? CHECK_MARKS.open : level.bullet || '•';
    return `<text:list-level-style-bullet text:level="${n}" text:bullet-char="${escapeXmlAttribute(bullet)}">${levelPropsXml(level, at)}</text:list-level-style-bullet>`;
  });
  return `<text:list-style style:name="${escapeXmlAttribute(name)}">${levels.join('')}</text:list-style>`;
}
