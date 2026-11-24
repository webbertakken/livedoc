// Headers and footers in a Word file (docs/specs/034-text-documents/page-layout.md "Headers and footers", "In the
// file"): a section's `w:headerReference` and `w:footerReference` by type, each naming a `w:hdr` or `w:ftr` part, and
// Different odd and even as the settings' `w:evenAndOddHeaders`, the whole document's: read, and written, each part under
// the part it came from or numbered, a section without odd and even writing its default as its even one.
import {
  attributeOf,
  childElements,
  RELATIONSHIP_TYPES,
  resolvePartName,
  type KeptXml,
  type OoxmlPackage,
  type PackageRefusal,
  type Relationship,
  type XmlElement,
  type XmlParsed,
} from '@livedoc/office-packages';
import type { Block, Paragraph } from '../model/blocks';
import type { Section } from '../model/sections';
import type { Table } from '../model/tables';
import type { OoxmlSource } from '../model/text-document';
import { relativeTarget, type RelationshipList } from './ooxml-relationships';
import type { ReportBuilder } from '../report';
import {
  HEADER_FOOTER_KINDS,
  HEADER_FOOTER_SLOTS,
  HeadersAndFooters,
  type HeaderFooter,
  type HeaderFooterKind,
  type HeaderFooterSlot,
  type ResolvedHeaders,
  type SectionHeaders,
} from '../model/headers';
import { toggle } from './ooxml-props';
import { R_NS, W_NS, XML_HEAD, declarations } from './ooxml-names';

/** A section's reference element for each kind. */
export const REFERENCE_OF: Record<HeaderFooterKind, string> = {
  header: 'headerReference',
  footer: 'footerReference',
};

/** A part's root element for each kind. */
export const ROOT_OF: Record<HeaderFooterKind, string> = { header: 'hdr', footer: 'ftr' };

const SLOTS: ReadonlySet<string> = new Set<HeaderFooterSlot>(['default', 'first', 'even']);

export type Reference = { kind: HeaderFooterKind; slot: HeaderFooterSlot; id: string };

/** A section's references in order; one of another type is passed over, a later one of a type wins (Word's). */
export function readReferences(sectPr: XmlElement): Reference[] {
  const found = new Map<string, Reference>();
  for (const e of childElements(sectPr)) {
    if (e.uri !== W_NS) continue;
    const kind = (Object.keys(REFERENCE_OF) as HeaderFooterKind[]).find(
      (k) => REFERENCE_OF[k] === e.local,
    );
    const slot = attributeOf(e, W_NS, 'type') ?? 'default';
    const id = attributeOf(e, R_NS, 'id');
    if (!kind || !SLOTS.has(slot) || !id) continue;
    found.set(`${kind} ${slot}`, { kind, slot: slot as HeaderFooterSlot, id });
  }
  return [...found.values()];
}

/** Whether a Word file's settings make every section's even pages their own (`w:evenAndOddHeaders`). */
export const readEvenAndOdd = (settings: XmlElement | undefined): boolean =>
  settings !== undefined &&
  childElements(settings).some(
    (e) => e.uri === W_NS && e.local === 'evenAndOddHeaders' && toggle(e) === true,
  );

/**
 * What a section's references come to, for its kept `w:sectPr`: each header's and footer's part by slot, the first
 * page's own, and whether its default is written as its even one. The same signature writes the kept XML as it came.
 */
export function referenceSignature(
  headers: SectionHeaders | undefined,
  fillsEven: boolean,
): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const kind of HEADER_FOOTER_KINDS)
    for (const slot of HEADER_FOOTER_SLOTS) {
      const story = headers?.[kind]?.[slot];
      if (story) out[`${kind} ${slot}`] = story.part ?? '';
    }
  if (headers?.differentFirst) out.first = true;
  if (fillsEven) out.fillsEven = true;
  return out;
}

/** What reading a header part takes from the document's reader. */
export type HeaderPartsSource = {
  readonly rels: readonly Relationship[];
  readonly pkg: OoxmlPackage;
  readonly report: ReportBuilder;
  /** The part being read: a header's while its paragraphs are read. */
  part: { parsed: XmlParsed; name: string; rels: readonly Relationship[] };
  readonly parsePart: (name: string) => XmlParsed | PackageRefusal | undefined;
  paragraph(p: XmlElement, endsWith: Section | undefined): Paragraph;
  /** The blocks an element holds (paragraphs, tables, kept elements), read in the current part. */
  blocksOf(parent: XmlElement): Block[];
  kept(parsed: XmlParsed, e: XmlElement): KeptXml;
};

const isW = (e: XmlElement, local: string) => e.uri === W_NS && e.local === local;

/** Each section's headers and footers, read from the parts its references name, each part once. */
export class HeaderPartsReader {
  readonly #source: HeaderPartsSource;
  readonly #read = new Map<string, HeaderFooter | null>();

  constructor(source: HeaderPartsSource) {
    this.#source = source;
  }

  /** Whether a part was read as a header or footer: the model holds it, not the kept parts. */
  holds(name: string): boolean {
    return !!this.#read.get(name);
  }

  /** A section's headers and footers from its references; Different odd and even is the whole document's in Word. */
  headersOf(sectPr: XmlElement, oddEven: boolean): SectionHeaders | undefined {
    const { rels, pkg, report } = this.#source;
    const own: Record<HeaderFooterKind, Partial<Record<HeaderFooterSlot, HeaderFooter>>> = {
      header: {},
      footer: {},
    };
    for (const { kind, slot, id } of readReferences(sectPr)) {
      const rel = rels.find((r) => r.id === id && !r.external);
      const name = rel && resolvePartName(pkg.mainPart, rel.target);
      const story = name === undefined ? null : this.#story(name, kind);
      if (story) own[kind][slot] = story;
      else report.drop('header-footer', kind);
    }
    const first = childElements(sectPr).find((e) => isW(e, 'titlePg'));
    const headers: SectionHeaders = {
      ...(Object.keys(own.header).length > 0 ? { header: own.header } : {}),
      ...(Object.keys(own.footer).length > 0 ? { footer: own.footer } : {}),
      ...(toggle(first) === true ? { differentFirst: true as const } : {}),
      ...(oddEven ? { differentOddEven: true as const } : {}),
    };
    return Object.keys(headers).length > 0 ? headers : undefined;
  }

  /** A header or footer part's blocks, read once; null when it is missing or not that kind's part. */
  #story(name: string, kind: HeaderFooterKind): HeaderFooter | null {
    if (this.#read.has(name)) return this.#read.get(name)!;
    const source = this.#source;
    const parsed = source.parsePart(name);
    let story: HeaderFooter | null = null;
    if (parsed?.ok && isW(parsed.root, ROOT_OF[kind])) {
      const outer = source.part;
      source.part = { parsed, name, rels: source.pkg.relationships.get(name) ?? [] };
      const blocks = source.blocksOf(parsed.root);
      source.part = outer;
      story = { blocks, part: name };
    }
    this.#read.set(name, story);
    return story;
  }
}

/** What writing a header part takes from the document's writer. */
export type HeaderPartsHost = {
  readonly rels: RelationshipList;
  readonly mainPart: string;
  readonly source: OoxmlSource | undefined;
  readonly ns: Readonly<Record<string, string>>;
  /** The relationships links are written to; a header's own while its part is written. */
  partRels: RelationshipList;
  paragraphXml(p: Paragraph, ends: Section | undefined): string;
  kept(xml: KeptXml): string;
  tableXml(table: Table): string;
};

type Part = { story: HeaderFooter; name: string; kind: HeaderFooterKind; id: string };

export class HeaderPartsWriter {
  readonly #host: HeaderPartsHost;
  /** Every section's headers and footers with linking followed, in order. */
  readonly #resolved: readonly ResolvedHeaders[];
  readonly #parts = new Map<HeaderFooter, Part>();
  /** Different odd and even is the whole document's in Word: on when any section has it. */
  readonly evenAndOdd: boolean;

  constructor(host: HeaderPartsHost, sections: readonly Section[]) {
    this.#host = host;
    this.#resolved = HeadersAndFooters.resolve(sections.map((s) => s.headers));
    this.evenAndOdd = sections.some((s) => s.headers?.differentOddEven);
  }

  /** What a section's references come to, matched against what its kept `w:sectPr` was read with. */
  signature(section: Section): Record<string, string | boolean> {
    return referenceSignature(
      section.headers,
      this.evenAndOdd && !section.headers?.differentOddEven,
    );
  }

  /** A section's references: its own headers and footers, and its default as its even one when only others have odd and even. */
  referencesXml(section: Section, at: number): string {
    const own = section.headers;
    const out: string[] = [];
    for (const kind of HEADER_FOOTER_KINDS)
      for (const slot of HEADER_FOOTER_SLOTS) {
        let story = own?.[kind]?.[slot];
        if (!story && slot === 'even' && this.evenAndOdd && !own?.differentOddEven)
          story = this.#resolved[at]?.[kind].default ?? { blocks: [] };
        if (story)
          out.push(`<w:${REFERENCE_OF[kind]} w:type="${slot}" r:id="${this.#id(kind, story)}"/>`);
      }
    return out.join('');
  }

  /** The parts the sections named, in the order they were first named. */
  parts(): readonly Part[] {
    return [...this.#parts.values()];
  }

  /** The relationship ids the sections named. */
  ids(): ReadonlySet<string> {
    return new Set(this.parts().map((p) => p.id));
  }

  /** A header or footer part: its blocks, links into its own relationships, at least one paragraph. */
  partXml(kind: HeaderFooterKind, story: HeaderFooter, rels: RelationshipList): string {
    const host = this.#host;
    const outer = host.partRels;
    host.partRels = rels;
    const blocks = story.blocks
      .map((b) =>
        b.type === 'paragraph'
          ? host.paragraphXml(b, undefined)
          : b.type === 'kept'
            ? host.kept(b.xml)
            : b.type === 'table'
              ? host.tableXml(b)
              : '',
      )
      .join('');
    host.partRels = outer;
    const content = blocks.includes('<w:p') ? blocks : `${blocks}<w:p/>`;
    // `livedoc` ignorable: a drawing's picture names its drawing tab (objects.md "In the file").
    return `${XML_HEAD}<w:${ROOT_OF[kind]}${declarations(host.ns)} mc:Ignorable="livedoc">${content}</w:${ROOT_OF[kind]}>\n`;
  }

  /** The relationship id of a header or footer's part, named once: under the part it came from, else numbered. */
  #id(kind: HeaderFooterKind, story: HeaderFooter): string {
    const known = this.#parts.get(story);
    if (known) return known.id;
    const host = this.#host;
    const taken = new Set(this.parts().map((s) => s.name));
    const sourceNames = new Set((host.source?.parts ?? []).map((p) => p.name));
    let name = story.part && !taken.has(story.part) ? story.part : undefined;
    for (let n = 1; name === undefined; n += 1) {
      const candidate = `word/${kind}${n}.xml`;
      if (!taken.has(candidate) && !sourceNames.has(candidate)) name = candidate;
    }
    const id = host.rels.id(RELATIONSHIP_TYPES[kind], relativeTarget(host.mainPart, name));
    this.#parts.set(story, { story, name, kind, id });
    return id;
  }
}
