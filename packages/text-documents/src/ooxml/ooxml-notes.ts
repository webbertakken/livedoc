// Footnotes in a Word file (docs/specs/034-text-documents/page-layout.md "Footnotes", "In the file"): a run's
// `w:footnoteReference` names a `w:footnote` of the footnotes part, whose paragraphs are the note; the note's first
// paragraph is led by its `w:footnoteRef` run (the number). Footnotes the model does not hold (the separators, one a
// kept mark names) are kept as they came and written back under their ids; the model's are numbered after them.
import {
  attributeOf,
  childElements,
  escapeXmlAttribute,
  keptXmlOf,
  RELATIONSHIP_TYPES,
  resolvePartName,
  type KeptXml,
  type OoxmlPackage,
  type PackageRefusal,
  type Relationship,
  type XmlElement,
  type XmlParsed,
} from '@livedoc/office-packages';
import type { Block, Note, Paragraph } from '../model/blocks';
import type { TextProps } from '../model/props';
import type { Table } from '../model/tables';
import type { OoxmlFootnotesSource } from '../model/text-document';
import type { ReportBuilder } from '../report';
import type { RelationshipList } from './ooxml-relationships';
import { W_NS, XML_HEAD } from './ooxml-names';

const isW = (e: XmlElement, local: string) => e.uri === W_NS && e.local === local;

/** The note's number run, leading its first paragraph. */
export const FOOTNOTE_REF_RUN =
  '<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteRef/></w:r>';

/** Word's separator and continuation separator, for a part that came with none. */
const SEPARATORS = [
  '<w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote>',
  '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>',
];

/** The mark's formatting without the superscript every mark has. */
export function markProps(props: TextProps): TextProps {
  if (props.vertical !== 'super') return props;
  const { vertical: _, ...rest } = props;
  return rest;
}

/** What reading the footnotes part takes from the document's reader. */
export type FootnotesSource = {
  readonly rels: readonly Relationship[];
  readonly pkg: OoxmlPackage;
  readonly report: ReportBuilder;
  part: { parsed: XmlParsed; name: string; rels: readonly Relationship[] };
  readonly parsePart: (name: string) => XmlParsed | PackageRefusal | undefined;
  /** While a note's paragraphs are read: its number run is dropped, a mark in it kept. */
  readingNote: boolean;
  paragraph(p: XmlElement, endsWith: undefined): Paragraph;
  kept(parsed: XmlParsed, e: XmlElement): KeptXml;
  /** The blocks an element holds (paragraphs, tables, kept elements), read in the current part. */
  blocksOf(parent: XmlElement): Block[];
};

/** The footnotes part, read once, each footnote a reference names read as a note. */
export class FootnotesReader {
  readonly #source: FootnotesSource;
  #part: { name: string; parsed: XmlParsed; byId: Map<string, XmlElement> } | null | undefined;
  readonly #read = new Set<string>();

  constructor(source: FootnotesSource) {
    this.#source = source;
  }

  /** A note's blocks by its footnote's id; undefined when no such footnote is there. */
  blocks(id: string): Block[] | undefined {
    const part = this.#load();
    const footnote = part?.byId.get(id);
    if (!part || !footnote || attributeOf(footnote, W_NS, 'type') !== undefined) return undefined;
    const source = this.#source;
    const outer = source.part;
    source.part = {
      parsed: part.parsed,
      name: part.name,
      rels: source.pkg.relationships.get(part.name) ?? [],
    };
    source.readingNote = true;
    const blocks = source.blocksOf(footnote);
    source.readingNote = false;
    source.part = outer;
    this.#read.add(id);
    return blocks;
  }

  /** The part as the document's source keeps it: the footnotes no note was read from. */
  kept(): OoxmlFootnotesSource | undefined {
    const part = this.#load();
    if (!part) return undefined;
    const kept = [...part.byId]
      .filter(([id]) => !this.#read.has(id))
      .map(([id, e]) => ({ id, xml: keptXmlOf(part.parsed, e) }));
    return { part: part.name, kept };
  }

  #load() {
    if (this.#part !== undefined) return this.#part;
    const { rels, pkg, parsePart } = this.#source;
    const rel = rels.find((r) => r.type === RELATIONSHIP_TYPES.footnotes && !r.external);
    const name = rel && resolvePartName(pkg.mainPart, rel.target);
    const parsed = name === undefined ? undefined : parsePart(name);
    this.#part =
      name !== undefined && parsed?.ok && isW(parsed.root, 'footnotes')
        ? {
            name,
            parsed,
            byId: new Map(
              childElements(parsed.root)
                .filter((e) => isW(e, 'footnote') && attributeOf(e, W_NS, 'id') !== undefined)
                .map((e) => [attributeOf(e, W_NS, 'id')!, e]),
            ),
          }
        : null;
    return this.#part;
  }
}

/** What writing the footnotes part takes from the document's writer. */
export type FootnotesHost = {
  readonly ns: Readonly<Record<string, string>>;
  partRels: RelationshipList;
  paragraphXml(p: Paragraph, ends: undefined, lead?: string): string;
  kept(xml: KeptXml): string;
  tableXml(table: Table): string;
};

const declarations = (ns: Readonly<Record<string, string>>) =>
  Object.entries(ns)
    .map(([p, uri]) => ` xmlns${p ? `:${p}` : ''}="${escapeXmlAttribute(uri)}"`)
    .join('');

/** The model's notes numbered as the part names them: after the kept footnotes' ids, in the body's order. */
export function footnoteIds(
  notes: readonly Note[],
  kept: OoxmlFootnotesSource | undefined,
): Map<Note, string> {
  const taken = (kept?.kept ?? []).map((k) => Number(k.id)).filter(Number.isInteger);
  let next = Math.max(0, ...taken) + 1;
  return new Map(notes.map((note) => [note, String(next++)]));
}

/** The footnotes part: the kept footnotes (or Word's separators), then each note, its first paragraph led by its number. */
export function footnotesPartXml(
  host: FootnotesHost,
  ids: ReadonlyMap<Note, string>,
  kept: OoxmlFootnotesSource | undefined,
  rels: RelationshipList,
): string {
  const outer = host.partRels;
  host.partRels = rels;
  // A file's part keeps what it had (Google Docs writes no separators); a new document gets Word's separators.
  const out: string[] = kept ? kept.kept.map((k) => host.kept(k.xml)) : SEPARATORS;
  for (const [note, id] of ids) {
    const led = note.blocks[0]?.type === 'paragraph';
    const blocks = note.blocks.map((b, i) =>
      b.type === 'paragraph'
        ? host.paragraphXml(b, undefined, i === 0 ? FOOTNOTE_REF_RUN : undefined)
        : b.type === 'kept'
          ? host.kept(b.xml)
          : b.type === 'table'
            ? host.tableXml(b)
            : '',
    );
    const content = led ? blocks.join('') : `<w:p>${FOOTNOTE_REF_RUN}</w:p>${blocks.join('')}`;
    out.push(`<w:footnote w:id="${id}">${content}</w:footnote>`);
  }
  host.partRels = outer;
  return `${XML_HEAD}<w:footnotes${declarations(host.ns)}>${out.join('')}</w:footnotes>\n`;
}
