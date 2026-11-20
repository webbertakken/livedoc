// Writing an OOXML text document (standard-mapping.md): the model into WordprocessingML parts, kept parts and
// relationships back as they were, relationship ids kept and new ones numbered after them. Deterministic.
import {
  colourToOoxml,
  escapeXmlAttribute,
  escapeXmlText,
  keptXmlWithin,
  OOXML_CONTENT_TYPES,
  ooxmlAppXml,
  ooxmlCoreXml,
  RELATIONSHIP_TYPES,
  statisticsOf,
  writeOoxmlPackage,
  type KeptXml,
  type OoxmlPart,
  type Relationship,
} from '@livedoc/office-packages';
import type { Block, Inline, Paragraph, SectionBreak } from '../model/blocks';
import { keptStillHolds, type TextProps } from '../model/props';
import type { Section } from '../model/sections';
import { Styles, type Style } from '../model/styles';
import type { TabStop } from '../model/tab-stops';
import { settingsXml } from './ooxml-tabs';
import { TextDocument, type OoxmlSource } from '../model/text-document';
import { byId } from './ooxml-read';
import { PPR_ORDER, RPR_ORDER, WRITTEN_W_NS } from './ooxml-names';
import {
  abstractNumXml,
  ordered,
  paragraphPropsChildren,
  runPropsChildren,
  sectionXml,
} from './ooxml-props';

const STYLE_ORDER =
  'name aliases basedOn next link autoRedefine hidden uiPriority semiHidden unhideWhenUsed qFormat locked personal personalCompose personalReply rsid pPr rPr tblPr trPr tcPr tblStylePr'.split(
    ' ',
  );

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const declarations = (ns: Readonly<Record<string, string>>) =>
  Object.entries(ns)
    .map(([p, uri]) => ` xmlns${p ? `:${p}` : ''}="${escapeXmlAttribute(uri)}"`)
    .join('');

function mergeNamespaces(
  kept: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const extra = Object.entries(kept ?? {}).filter(
    ([p, uri]) => p !== '' && !(p in WRITTEN_W_NS) && !Object.values(WRITTEN_W_NS).includes(uri),
  );
  return { ...WRITTEN_W_NS, ...Object.fromEntries(extra) };
}

/** Relationships of one source part: kept ones first with their ids, new ones numbered after the highest kept id. */
class RelationshipList {
  readonly list: Relationship[];
  #next: number;

  constructor(kept: readonly Relationship[]) {
    this.list = [...kept];
    const numbers = kept.map((r) => Number(r.id.match(/^rId(\d+)$/)?.[1] ?? 0));
    this.#next = Math.max(0, ...numbers) + 1;
  }

  /** The id of a relationship of this type and target: an existing one, or a new one. */
  id(type: string, target: string, external = false): string {
    const found = this.list.find(
      (r) => r.type === type && r.target === target && !!r.external === external,
    );
    if (found) return found.id;
    let id = `rId${this.#next++}`;
    while (this.list.some((r) => r.id === id)) id = `rId${this.#next++}`;
    this.list.push({ id, type, target, ...(external ? { external } : {}) });
    return id;
  }
}

const relativeTarget = (from: string, to: string) => {
  const dir = from.split('/').slice(0, -1);
  const parts = to.split('/');
  let i = 0;
  while (i < dir.length && dir[i] === parts[i]) i += 1;
  return [...dir.slice(i).map(() => '..'), ...parts.slice(i)].join('/');
};

class OoxmlWriter {
  readonly doc: TextDocument;
  readonly source: OoxmlSource | undefined;
  readonly ns: Record<string, string>;
  readonly mainPart: string;
  readonly stylesPart: string;
  readonly numberingPart: string;
  readonly rels: RelationshipList;
  readonly numIds = new Map<string, string>();
  // Each list paragraph's num: its list's, or, from a restart on, a num of the list's own (standard-mapping.md "Lists").
  readonly paragraphNumIds = new Map<Paragraph, string>();
  readonly restartNums: { numId: string; list: string; level: number; start: number }[] = [];
  readonly defaultStyle: string | undefined;

  constructor(doc: TextDocument) {
    this.doc = doc;
    const source = doc.source?.format === 'ooxml' ? doc.source : undefined;
    this.source = source;
    this.ns = mergeNamespaces(source?.documentNamespaces);
    this.mainPart = source?.mainPart ?? 'word/document.xml';
    this.stylesPart = source?.stylesPart ?? 'word/styles.xml';
    this.numberingPart = source?.numberingPart ?? 'word/numbering.xml';
    const keptRels = (source?.relationships.get(this.mainPart) ?? []).filter(
      (r) => r.type !== RELATIONSHIP_TYPES.styles && r.type !== RELATIONSHIP_TYPES.numbering,
    );
    const original = source?.relationships.get(this.mainPart) ?? [];
    // The styles and numbering relationships keep their ids when the file had them.
    this.rels = new RelationshipList([
      ...keptRels,
      ...original.filter(
        (r) => r.type === RELATIONSHIP_TYPES.styles || r.type === RELATIONSHIP_TYPES.numbering,
      ),
    ]);
    this.defaultStyle = doc.styles.find((s) => s.role === 'normal' && s.family === 'paragraph')?.id;
    this.assignNumIds();
  }

  kept(xml: KeptXml, ns: Readonly<Record<string, string>> = this.ns): string {
    return keptXmlWithin(xml, ns);
  }

  assignNumIds(): void {
    const used = new Set<string>();
    const ids = Object.keys(this.doc.lists);
    for (const id of ids)
      if (/^[1-9]\d*$/.test(id)) {
        this.numIds.set(id, id);
        used.add(id);
      }
    let next = 1;
    for (const id of ids) {
      if (this.numIds.has(id)) continue;
      while (used.has(String(next))) next += 1;
      this.numIds.set(id, String(next));
      used.add(String(next));
    }
    const current = new Map(this.numIds);
    for (const block of this.doc.body) {
      if (block.type !== 'paragraph' || !block.list || !current.has(block.list.id)) continue;
      const { id, level, restart } = block.list;
      if (restart !== undefined) {
        while (used.has(String(next))) next += 1;
        const numId = String(next);
        used.add(numId);
        this.restartNums.push({ numId, list: id, level, start: restart });
        current.set(id, numId);
      }
      this.paragraphNumIds.set(block, current.get(id)!);
    }
  }

  sectPr(section: Section): string {
    const values = { start: section.start, setup: section.setup };
    if (section.kept && keptStillHolds(section.kept, values)) return this.kept(section.kept.xml);
    return sectionXml(
      section.start,
      section.setup,
      (section.kept?.residue ?? []).map((r) => this.kept(r)),
      section.kept?.xml.xml,
    );
  }

  pPr(p: Paragraph, ends: Section | undefined): string {
    const list = p.list && {
      id: this.paragraphNumIds.get(p) ?? this.numIds.get(p.list.id) ?? p.list.id,
      level: p.list.level,
    };
    const values = {
      style: p.style,
      props: p.props,
      list,
      section: ends && { start: ends.start, setup: ends.setup },
    };
    if (p.kept && keptStillHolds(p.kept, values)) return this.kept(p.kept.xml);
    const numbered = list;
    // The default paragraph style is what a paragraph without `w:pStyle` has: it is not named.
    const style = p.style === this.defaultStyle ? undefined : p.style;
    const children = ordered(
      PPR_ORDER,
      paragraphPropsChildren(
        style,
        p.props,
        numbered,
        ends && this.sectPr(ends),
        this.inheritedTabs(p.style),
      ),
      (p.kept?.residue ?? []).map((r) => this.kept(r)),
    );
    return children ? `<w:pPr>${children}</w:pPr>` : '';
  }

  rPr(inline: { style?: string; props: TextProps; kept?: Inline['kept'] }): string {
    if (inline.kept && keptStillHolds(inline.kept, { style: inline.style, props: inline.props }))
      return this.kept(inline.kept.xml);
    const children = ordered(
      RPR_ORDER,
      runPropsChildren(inline.style, inline.props),
      (inline.kept?.residue ?? []).map((r) => this.kept(r)),
    );
    return children ? `<w:rPr>${children}</w:rPr>` : '';
  }

  runXml(run: Extract<Inline, { type: 'run' }>): string {
    const rPr = this.rPr(run);
    const pieces = run.text.split(/(\t|\n)/).filter((s) => s !== '');
    const content = pieces
      .map((piece) => {
        if (piece === '\t') return '<w:tab/>';
        if (piece === '\n') return '<w:br/>';
        const preserve = /^\s|\s$|\s\s/.test(piece) ? ' xml:space="preserve"' : '';
        return `<w:t${preserve}>${escapeXmlText(piece)}</w:t>`;
      })
      .join('');
    return `<w:r>${rPr}${content}</w:r>`;
  }

  paragraphXml(p: Paragraph, ends: Section | undefined): string {
    const pieces = p.inlines.map((i) => ({
      link: i.link,
      xml: i.type === 'run' ? this.runXml(i) : this.kept(i.xml),
    }));
    let content = '';
    for (let i = 0; i < pieces.length;) {
      const link = pieces[i]!.link;
      let j = i;
      let xml = '';
      while (j < pieces.length && pieces[j]!.link === link) xml += pieces[j++]!.xml;
      if (link === undefined) content += xml;
      else if (link.startsWith('#'))
        content += `<w:hyperlink w:anchor="${escapeXmlAttribute(link.slice(1))}">${xml}</w:hyperlink>`;
      else
        content += `<w:hyperlink r:id="${this.rels.id(RELATIONSHIP_TYPES.hyperlink, link, true)}">${xml}</w:hyperlink>`;
      i = j;
    }
    const checked = p.list?.checked ? ' livedoc:checked="true"' : '';
    return `<w:p${checked}>${this.pPr(p, ends)}${content}</w:p>`;
  }

  bodyXml(): string {
    const out: string[] = [];
    let current: Section = this.doc.section;
    const blocks: readonly Block[] = this.doc.body;
    blocks.forEach((block, i) => {
      const next = blocks[i + 1];
      const ends = next?.type === 'section' ? current : undefined;
      if (block.type === 'paragraph') out.push(this.paragraphXml(block, ends));
      else if (block.type === 'kept') {
        out.push(this.kept(block.xml));
        if (ends) out.push(`<w:p><w:pPr>${this.sectPr(ends)}</w:pPr></w:p>`);
      } else {
        const previous = blocks[i - 1];
        if (!previous || previous.type === 'section')
          out.push(`<w:p><w:pPr>${this.sectPr(current)}</w:pPr></w:p>`);
        current = block satisfies SectionBreak;
      }
    });
    out.push(this.sectPr(current));
    return out.join('');
  }

  documentXml(): string {
    const ignorable = [
      ...new Set([...(this.source?.ignorable ?? []).filter((p) => p in this.ns), 'livedoc']),
    ].join(' ');
    const color = this.doc.section.setup.pageColor;
    const background = color ? `<w:background w:color="${colourToOoxml(color)}"/>` : '';
    return `${XML_HEAD}<w:document${declarations(this.ns)} mc:Ignorable="${ignorable}">${background}<w:body>${this.bodyXml()}</w:body></w:document>\n`;
  }

  /** The stops a paragraph or style of this parent inherits, what its `w:tabs` is written over. */
  inheritedTabs(style: string | undefined): readonly TabStop[] {
    return Styles.paragraphPropsOf(this.doc.styles, this.doc.defaults, style).tabStops ?? [];
  }

  styleXml(style: Style): string {
    const { kept, ...values } = style;
    if (kept && keptStillHolds(kept, values))
      return this.kept(kept.xml, mergeNamespaces(this.source?.stylesNamespaces));
    const { outlineLevel, ...paragraph } = style.paragraph;
    const pPr = ordered(
      PPR_ORDER,
      paragraphPropsChildren(
        undefined,
        { ...paragraph, outlineLevel },
        undefined,
        undefined,
        this.inheritedTabs(style.parent),
      ),
      [],
    );
    const rPr = ordered(RPR_ORDER, runPropsChildren(undefined, style.text), []);
    const tag = (local: string, v: string | undefined) =>
      v === undefined ? undefined : `<w:${local} w:val="${escapeXmlAttribute(v)}"/>`;
    const children = ordered(
      STYLE_ORDER,
      {
        name: tag('name', style.name),
        basedOn: tag('basedOn', style.parent),
        next: tag('next', style.next),
        pPr: pPr && style.family === 'paragraph' ? `<w:pPr>${pPr}</w:pPr>` : undefined,
        rPr: rPr ? `<w:rPr>${rPr}</w:rPr>` : undefined,
      },
      (kept?.residue ?? []).map((r) => this.kept(r)),
    );
    const isDefault = style.role === 'normal' ? ' w:default="1"' : '';
    return `<w:style w:type="${style.family === 'text' ? 'character' : 'paragraph'}"${isDefault} w:styleId="${escapeXmlAttribute(style.id)}">${children}</w:style>`;
  }

  stylesXml(): string {
    const ns = mergeNamespaces(this.source?.stylesNamespaces);
    const { kept, ...values } = this.doc.defaults;
    const defaults =
      kept && keptStillHolds(kept, values)
        ? this.kept(kept.xml, ns)
        : `<w:docDefaults><w:rPrDefault><w:rPr>${ordered(RPR_ORDER, runPropsChildren(undefined, values.text), [])}</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>${ordered(PPR_ORDER, paragraphPropsChildren(undefined, values.paragraph, undefined, undefined), [])}</w:pPr></w:pPrDefault></w:docDefaults>`;
    const keptStyles = this.source?.styles ?? [];
    const latent = keptStyles
      .filter((k) => /^<(?:\w+:)?latentStyles/.test(k.xml))
      .map((k) => this.kept(k, ns));
    const others = keptStyles
      .filter((k) => !/^<(?:\w+:)?latentStyles/.test(k.xml))
      .map((k) => this.kept(k, ns));
    return `${XML_HEAD}<w:styles${declarations(ns)}>${defaults}${latent.join('')}${this.doc.styles.map((s) => this.styleXml(s)).join('')}${others.join('')}</w:styles>\n`;
  }

  numberingXml(): string | undefined {
    const lists = Object.entries(this.doc.lists);
    if (lists.length === 0 && !this.source?.numberingPart) return undefined;
    const ns = mergeNamespaces(this.source?.numberingNamespaces);
    const abstracts = new Map<string, string>();
    const nums: string[] = [];
    const usedAbstract = new Set(
      lists.map(([, l]) => l.kept?.name).filter((n): n is string => n !== undefined),
    );
    let nextAbstract = 0;
    const abstractOf = new Map<string, string>();
    for (const [id, list] of lists) {
      const numId = this.numIds.get(id)!;
      if (list.kept?.name && keptStillHolds(list.kept, list.levels) && numId === id) {
        const abstract = list.kept.residue[0];
        if (abstract) abstracts.set(list.kept.name, this.kept(abstract, ns));
        nums.push(this.kept(list.kept.xml, ns));
        abstractOf.set(id, list.kept.name);
        continue;
      }
      while (usedAbstract.has(String(nextAbstract))) nextAbstract += 1;
      const abstractId = String(nextAbstract);
      usedAbstract.add(abstractId);
      abstracts.set(abstractId, abstractNumXml(abstractId, list.levels));
      abstractOf.set(id, abstractId);
      nums.push(`<w:num w:numId="${numId}"><w:abstractNumId w:val="${abstractId}"/></w:num>`);
    }
    for (const { numId, list, level, start } of this.restartNums)
      nums.push(
        `<w:num w:numId="${numId}"><w:abstractNumId w:val="${escapeXmlAttribute(abstractOf.get(list)!)}"/><w:lvlOverride w:ilvl="${level}"><w:startOverride w:val="${start}"/></w:lvlOverride></w:num>`,
      );
    const kept = this.source?.numbering ?? [];
    const pictures = kept
      .filter((k) => /^<(?:\w+:)?numPicBullet/.test(k.xml))
      .map((k) => this.kept(k, ns));
    const rest = kept
      .filter((k) => !/^<(?:\w+:)?numPicBullet/.test(k.xml))
      .map((k) => this.kept(k, ns));
    return `${XML_HEAD}<w:numbering${declarations(ns)} mc:Ignorable="livedoc">${pictures.join('')}${[...abstracts.values()].join('')}${nums.join('')}${rest.join('')}</w:numbering>\n`;
  }
}

/** The text document as a `.docx` package. */
export function writeOoxml(document: TextDocument, generator: string): Uint8Array<ArrayBuffer> {
  const w = new OoxmlWriter(document);
  const encode = (text: string) => new TextEncoder().encode(text);
  const documentXml = w.documentXml();
  const numbering = w.numberingXml();
  const source = w.source;
  const parts: OoxmlPart[] = [
    {
      name: 'docProps/core.xml',
      contentType: OOXML_CONTENT_TYPES.coreProperties,
      data: encode(ooxmlCoreXml(document.metadata)),
    },
    {
      name: 'docProps/app.xml',
      contentType: OOXML_CONTENT_TYPES.extendedProperties,
      data: encode(
        ooxmlAppXml(
          document.metadata,
          statisticsOf(TextDocument.paragraphTexts(document)),
          generator,
        ),
      ),
    },
    { name: w.mainPart, contentType: OOXML_CONTENT_TYPES.document, data: encode(documentXml) },
    { name: w.stylesPart, contentType: OOXML_CONTENT_TYPES.styles, data: encode(w.stylesXml()) },
  ];
  w.rels.id(RELATIONSHIP_TYPES.styles, relativeTarget(w.mainPart, w.stylesPart));
  if (numbering) {
    parts.push({
      name: w.numberingPart,
      contentType: OOXML_CONTENT_TYPES.numbering,
      data: encode(numbering),
    });
    w.rels.id(RELATIONSHIP_TYPES.numbering, relativeTarget(w.mainPart, w.numberingPart));
  }
  if (!source) {
    parts.push({
      name: 'word/settings.xml',
      contentType: OOXML_CONTENT_TYPES.settings,
      data: encode(`${XML_HEAD}${settingsXml(document.defaults.paragraph.tabInterval)}\n`),
    });
    w.rels.id(RELATIONSHIP_TYPES.settings, 'settings.xml');
  }
  const written = new Set(parts.map((p) => p.name));
  for (const part of source?.parts ?? [])
    if (!written.has(part.name))
      parts.push({ name: part.name, contentType: part.mediaType, data: part.data });
  const generated = new Set<string>([
    RELATIONSHIP_TYPES.officeDocument,
    RELATIONSHIP_TYPES.coreProperties,
    RELATIONSHIP_TYPES.extendedProperties,
  ]);
  const pkg = new RelationshipList(
    (source?.relationships.get('') ?? []).filter((r) => !generated.has(r.type)),
  );
  const packageOriginal = source?.relationships.get('') ?? [];
  const idFor = (type: string) => packageOriginal.find((r) => r.type === type)?.id;
  const ordered: Relationship[] = [
    {
      id: idFor(RELATIONSHIP_TYPES.officeDocument) ?? '',
      type: RELATIONSHIP_TYPES.officeDocument,
      target: w.mainPart,
    },
    {
      id: idFor(RELATIONSHIP_TYPES.coreProperties) ?? '',
      type: RELATIONSHIP_TYPES.coreProperties,
      target: 'docProps/core.xml',
    },
    {
      id: idFor(RELATIONSHIP_TYPES.extendedProperties) ?? '',
      type: RELATIONSHIP_TYPES.extendedProperties,
      target: 'docProps/app.xml',
    },
  ];
  const packageRels = [
    ...ordered.map((r) => (r.id ? r : { ...r, id: pkg.id(r.type, r.target) })),
    ...pkg.list.filter((r) => !ordered.some((o) => o.type === r.type)),
  ];
  const unique = packageRels.filter((r, i) => packageRels.findIndex((x) => x.id === r.id) === i);
  const relationships = new Map<string, readonly Relationship[]>([
    ['', byId(unique)],
    [w.mainPart, byId(w.rels.list)],
  ]);
  for (const [from, rels] of source?.relationships ?? [])
    if (from !== '' && from !== w.mainPart && written.has(from) === false)
      relationships.set(from, rels);
  const defaults = new Map(
    [...(source?.defaults ?? [])].filter(([ext]) => ext !== 'rels' && ext !== 'xml'),
  );
  return writeOoxmlPackage(parts, relationships, defaults);
}
