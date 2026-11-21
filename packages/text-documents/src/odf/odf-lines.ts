// Line numbers in ODF (docs/specs/034-text-documents/page-layout.md "Line numbers", "In the file"): the whole document's
// `text:linenumbering-configuration` in the styles turns them on, counting on or restarting on each page; a paragraph
// says it is not numbered (`text:number-lines="false"`) or starts again at 1 (`text:line-number`). A section's first
// paragraph tells the model the section's line numbers; written back, every paragraph of a section without them says
// so, and a section restarting on its own starts its first at 1.
import { attributeOf, childElement, type XmlElement } from '@livedoc/office-packages';
import type { LineNumbers, Section } from '../model/sections';
import { NS } from './odf-names';

/** What a paragraph says of its line: not numbered, or numbered from 1 again. */
export type ParagraphLines = 'off' | 'restart';

/** The document's line numbering as its configuration has it. */
export type LineNumbering = {
  readonly on: boolean;
  readonly restartOnPage: boolean;
  readonly increment: number;
};

/** The configuration element's settings; ODF numbers lines unless it says `text:number-lines="false"`. */
export function readLineNumbering(e: XmlElement): LineNumbering {
  const increment = Number(attributeOf(e, NS.text, 'increment') ?? '1');
  return {
    on: attributeOf(e, NS.text, 'number-lines') !== 'false',
    restartOnPage: attributeOf(e, NS.text, 'restart-on-page') === 'true',
    increment: Number.isInteger(increment) && increment >= 1 ? increment : 1,
  };
}

export const isLineNumbering = (e: XmlElement): boolean =>
  e.uri === NS.text && e.local === 'linenumbering-configuration';

/** What a paragraph style's paragraph properties say of its lines. */
export function paragraphLinesOf(style: XmlElement): ParagraphLines | undefined {
  const props = childElement(style, NS.style, 'paragraph-properties');
  if (!props) return undefined;
  if (attributeOf(props, NS.text, 'number-lines') === 'false') return 'off';
  return attributeOf(props, NS.text, 'line-number') === undefined ? undefined : 'restart';
}

/** A section's line numbers from what its first paragraph says, the document's numbering on. */
export function sectionLines(
  numbering: LineNumbering,
  first: ParagraphLines | undefined,
): LineNumbers | undefined {
  if (!numbering.on || first === 'off') return undefined;
  return {
    restart: first === 'restart' ? 'section' : numbering.restartOnPage ? 'page' : 'continuous',
    ...(numbering.increment === 1 ? {} : { countBy: numbering.increment }),
  };
}

/** What a paragraph of `section` writes of its line, the first of its section or not; nothing with none numbered. */
export function paragraphLines(
  anyNumbered: boolean,
  section: Section,
  first: boolean,
): ParagraphLines | undefined {
  if (!anyNumbered) return undefined;
  if (!section.lineNumbers) return 'off';
  return first && section.lineNumbers.restart === 'section' ? 'restart' : undefined;
}

/** Paragraph properties' XML saying what a paragraph says of its line. */
export function withLines(propsXml: string, lines: ParagraphLines | undefined): string {
  if (!lines) return propsXml;
  const said = lines === 'off' ? ' text:number-lines="false"' : ' text:line-number="1"';
  return propsXml.startsWith('<style:paragraph-properties')
    ? propsXml.replace('<style:paragraph-properties', `<style:paragraph-properties${said}`)
    : `<style:paragraph-properties${said}/>`;
}

/**
 * The document's line numbering configuration: on, as the first numbered section counts, where any section is
 * numbered; else the file's own turned off, or none. The file's other settings (its offset, format) are carried.
 */
export function lineNumberingXml(sections: readonly Section[], held: string | undefined): string {
  // A file's own, written with the prefix LiveDoc writes, else LiveDoc's.
  const kept = held?.startsWith('<text:linenumbering-configuration') ? held : undefined;
  const first = sections.find((s) => s.lineNumbers)?.lineNumbers;
  if (!first) return kept ? withAttributes(kept, { 'text:number-lines': 'false' }) : '';
  const set = {
    'text:number-lines': 'true',
    'text:increment': String(first.countBy ?? 1),
    'text:restart-on-page': first.restart === 'page' ? 'true' : 'false',
  };
  return withAttributes(
    kept ??
      '<text:linenumbering-configuration style:num-format="1" text:number-position="left" text:offset="0.25in"/>',
    set,
  );
}

// The element with these attributes set, each in place where it is, else added.
function withAttributes(xml: string, set: Record<string, string>): string {
  let out = xml;
  for (const [name, value] of Object.entries(set)) {
    const own = new RegExp(`\\s${name}="[^"]*"`);
    out = own.test(out)
      ? out.replace(own, ` ${name}="${value}"`)
      : out.replace(
          /^<text:linenumbering-configuration/,
          `<text:linenumbering-configuration ${name}="${value}"`,
        );
  }
  return out;
}

/** Whether ODF holds each section's restart: on each page is the whole document's there. */
export function restartLosses(sections: readonly Section[]): number {
  const numbered = sections.flatMap((s) => (s.lineNumbers ? [s.lineNumbers] : []));
  const page = numbered[0]?.restart === 'page';
  return numbered.filter((n) => (n.restart === 'page') !== page).length;
}

/** Whether kept XML is a line numbering configuration, under whatever prefix the file gave it. */
export const isLineNumberingXml = (xml: string): boolean =>
  /^<(?:[\w.-]+:)?linenumbering-configuration[\s/>]/.test(xml);
