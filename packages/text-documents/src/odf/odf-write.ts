// Writing an ODF text document (standard-mapping.md): the model into `content.xml`, `styles.xml`, `meta.xml` and
// `settings.xml` of a package, or one flat file, with kept content back where it stood. Deterministic: the same
// document writes the same bytes.
import { DocumentFonts } from '@livedoc/document';
import {
  escapeXmlAttribute,
  keptXmlWithin,
  ODF_MEDIA_TYPES,
  ODF_VERSION,
  odfLengthToPt,
  odfMetaChildren,
  statisticsOf,
  writeOdfPackage,
  XML_DECLARATION,
  type KeptXml,
} from '@livedoc/office-packages';
import type { Block, Inline, Note, Paragraph, SectionBreak } from '../model/blocks';
import { Paragraph as Paragraphs } from '../model/blocks';
import type { ListDefinition } from '../model/lists';
import { canonical, compact, isEmpty, keptStillHolds, type TextProps } from '../model/props';
import { Columns, type PageSetup, type Section } from '../model/sections';
import { Styles, type Style } from '../model/styles';
import { TextDocument, type OdfSource } from '../model/text-document';
import { shortHash } from '../hash';
import { WRITTEN_NS } from './odf-names';
import { listStyleXml } from './odf-lists';
import { withPageless } from './odf-settings';
import { ABSOLUTE_TABS_SETTINGS, stopsWritten, type TabContext } from './odf-tabs';
import { TabStops } from '../model/tab-stops';
import { columnsXml, pageLayoutPropsXml, paragraphPropsXml, textPropsXml } from './odf-props';
import { headerLayout, masterStoriesXml, shownKinds, withStories } from './odf-headers';
import { HeadersAndFooters, type ResolvedHeaders } from '../model/headers';
import { paragraphContentXml, type Segment } from './odf-text-content';
import { odfFieldXml } from './odf-fields';
import { odfFootnoteXml } from './odf-notes';
import { Notes } from '../model/notes';

export type OdfWriteOptions = { flat: boolean; generator: string };

const attr = (name: string, value: string | undefined) =>
  value === undefined ? '' : ` ${name}="${escapeXmlAttribute(value)}"`;

const nameAttribute = (xml: string) => xml.match(/^<[^>]*?\sstyle:name="([^"]*)"/)?.[1];

class Named {
  readonly order: string[] = [];
  readonly byName = new Map<string, string>();

  /** Adds the XML under its name; false when another XML holds the name. */
  add(name: string, xml: string): boolean {
    const held = this.byName.get(name);
    if (held !== undefined) return held === xml;
    this.byName.set(name, xml);
    this.order.push(name);
    return true;
  }

  replace(name: string, xml: string): void {
    if (!this.byName.has(name)) this.order.push(name);
    this.byName.set(name, xml);
  }

  xml(): string {
    return this.order.map((n) => this.byName.get(n)!).join('');
  }
}

class OdfWriter {
  readonly ns: Readonly<Record<string, string>>;
  readonly source: OdfSource | undefined;
  readonly faces = new Set<string>();
  readonly fontFaces: string[] = [];
  /** The body's automatic styles (content.xml). */
  readonly contentAutomatic = new Named();
  /** Where automatic styles go: the body's, or styles.xml's while a header's paragraphs are written. */
  automatic: Named = this.contentAutomatic;
  readonly pageStyles = new Named();
  readonly masters = new Named();
  /** Every section's headers and footers with linking followed, by section. */
  readonly resolved = new Map<Section, ResolvedHeaders>();
  /** Writes a header's or footer's blocks (set by the body's writer). */
  storyXml: (blocks: readonly Block[]) => string = () => '';
  /** Each of the body's notes with its number, its citation (page-layout.md "Footnotes"). */
  readonly noteNumbers: Map<Note, number>;
  readonly #masterClaims = new Map<string, string>();
  readonly listNames = new Map<string, string>();
  #sections = 0;
  readonly #layoutClaims = new Map<string, string>();

  readonly document: TextDocument;
  /** Whether tab positions are written from the indent: as the arriving file counted them; never for a new one. */
  readonly tabsFromIndent: boolean;
  readonly tabs: TabContext;

  constructor(document: TextDocument) {
    this.document = document;
    this.noteNumbers = Notes.numbers(document.body);
    const source = document.source?.format === 'odf' ? document.source : undefined;
    this.source = source;
    this.tabsFromIndent = source !== undefined && source.tabsFromIndent !== false;
    this.tabs = { styles: document.styles, defaults: document.defaults, lists: document.lists };
    const inherited = Object.entries(source?.namespaces ?? {}).filter(
      ([p, uri]) =>
        p !== 'xml' && p !== '' && !(p in WRITTEN_NS) && !Object.values(WRITTEN_NS).includes(uri),
    );
    this.ns = { ...WRITTEN_NS, ...Object.fromEntries(inherited) };
    for (const face of source?.fontFaces ?? []) {
      const name = nameAttribute(face.xml);
      if (name) this.faces.add(name);
      this.fontFaces.push(this.kept(face));
    }
    for (const s of source?.automaticStyles ?? []) this.automatic.add(s.name, this.kept(s.xml));
    for (const s of source?.pageStyles ?? []) this.pageStyles.add(s.name, this.kept(s.xml));
    for (const m of source?.masterStyles ?? []) {
      const xml = this.kept(m);
      this.masters.add(nameAttribute(xml) ?? '', xml);
    }
    const sections = [
      document.section,
      ...document.body.filter((b): b is SectionBreak => b.type === 'section'),
    ];
    const resolved = HeadersAndFooters.resolve(sections.map((s) => s.headers));
    sections.forEach((section, i) => this.resolved.set(section, resolved[i]!));
  }

  kept(xml: KeptXml): string {
    return keptXmlWithin(xml, this.ns);
  }

  font(props: TextProps): void {
    if (props.font === undefined || this.faces.has(props.font)) return;
    this.faces.add(props.font);
    const family = /\s/.test(props.font) ? `'${props.font}'` : props.font;
    // Its generic family and pitch, so a suite without it picks a close fallback (fonts.md "In files").
    const known = DocumentFonts.find(props.font);
    this.fontFaces.push(
      `<style:font-face${attr('style:name', props.font)}${attr('svg:font-family', family)}${attr('style:font-family-generic', known?.generic)}${attr('style:font-pitch', known?.pitch)}/>`,
    );
  }

  generated(prefix: string, body: (name: string) => string): string {
    const name = `${prefix}${shortHash(body(''))}`;
    this.automatic.add(name, body(name));
    return name;
  }

  /** The automatic style a kept element names, when it still holds and its name is free or the same. */
  keptName(kept: { xml: KeptXml; name?: string } | undefined): string | undefined {
    if (!kept?.name) return undefined;
    return this.automatic.add(kept.name, this.kept(kept.xml)) ? kept.name : undefined;
  }

  /**
   * The paragraph's style; the first paragraph's master page is the document's, never part of what it read. A page's
   * first paragraph carries the number its page starts at (`start`, page-layout.md "Page numbers").
   */
  paragraphStyle(
    p: Paragraph,
    master: string | undefined,
    first: boolean,
    start: number | undefined,
  ): string {
    const values = {
      style: p.style,
      props: p.props,
      text: p.text,
      master: first ? undefined : master,
      start,
    };
    if (keptStillHolds(p.kept, values)) {
      const name = this.keptName(p.kept);
      if (name) return name;
    }
    const { outlineLevel: _, ...props } = stopsWritten(this.tabs, p, this.tabsFromIndent);
    if (isEmpty(props) && isEmpty(p.text ?? {}) && master === undefined && start === undefined)
      return p.style;
    this.font(p.text ?? {});
    const inner = withPageNumber(paragraphPropsXml(props), start) + textPropsXml(p.text ?? {});
    return this.generated('LDP', (name) => {
      const open = `<style:style${attr('style:name', name)} style:family="paragraph"${attr('style:parent-style-name', p.style)}${attr('style:master-page-name', master)}`;
      return inner ? `${open}>${inner}</style:style>` : `${open}/>`;
    });
  }

  textStyle(inline: Inline): string | undefined {
    if (keptStillHolds(inline.kept, { style: inline.style, props: inline.props })) {
      const name = this.keptName(inline.kept);
      if (name) return name;
    }
    if (isEmpty(inline.props)) return inline.style;
    this.font(inline.props);
    return this.generated(
      'LDT',
      (name) =>
        `<style:style${attr('style:name', name)} style:family="text"${attr('style:parent-style-name', inline.style)}>${textPropsXml(inline.props)}</style:style>`,
    );
  }

  listStyle(id: string, list: ListDefinition | undefined): string {
    const known = this.listNames.get(id);
    if (known) return known;
    const definition = list ?? { levels: [] };
    let name: string | undefined;
    if (keptStillHolds(list?.kept, list?.levels) && list?.kept?.name) {
      const kept = list.kept;
      const isAutomatic = this.source?.automaticStyles.some((s) => s.name === kept.name);
      const isNamed = this.source?.styles.some((s) => nameAttribute(s.xml) === kept.name);
      name =
        isAutomatic || isNamed
          ? kept.name
          : this.automatic.add(kept.name!, this.kept(kept.xml))
            ? kept.name
            : undefined;
    }
    name ??= this.generated('LDL', (n) => listStyleXml(n, definition));
    this.listNames.set(id, name);
    return name;
  }

  /**
   * The master page a section is written under: its own, kept, with its layout rebuilt when its setup or the headers it
   * shows changed, and its headers and footers written from the model; a master page another section claimed with other
   * headers or setup gets a copy of its own.
   */
  master(section: Section): string {
    const kept = section.kept;
    const resolved = this.resolved.get(section);
    const shown = shownKinds(resolved);
    const stories = masterStoriesXml(resolved, (story) => this.storyXml(story.blocks));
    const setup = canonical(section.setup);
    const claim = `${setup} ${stories}`;
    const claimed = kept?.name === undefined ? undefined : this.#masterClaims.get(kept.name);
    const layoutClaimed =
      kept?.layout === undefined ? undefined : this.#layoutClaims.get(kept.layout);
    const layoutClaim = `${setup} ${shown.header} ${shown.footer}`;
    if (
      kept?.name &&
      kept.layout &&
      this.source &&
      (claimed === undefined || claimed === claim) &&
      (layoutClaimed === undefined || layoutClaimed === layoutClaim)
    ) {
      this.#masterClaims.set(kept.name, claim);
      this.#layoutClaims.set(kept.layout, layoutClaim);
      if (!keptStillHolds(kept, { setup: section.setup, shown }))
        this.pageStyles.replace(
          kept.layout,
          this.pageLayoutXml(kept.layout, section.setup, kept.residue, shown),
        );
      const held = this.masters.byName.get(kept.name);
      if (held) this.masters.replace(kept.name, withStories(held, stories));
      return kept.name;
    }
    this.#sections += 1;
    const first = this.#sections === 1 && !this.source;
    const layout = first ? 'pm1' : `LDpl${shortHash(layoutClaim)}`;
    const master = first ? 'Standard' : `LDmp${shortHash(claim)}`;
    this.pageStyles.add(layout, this.pageLayoutXml(layout, section.setup, [], shown));
    const open = `<style:master-page${attr('style:name', master)}${attr('style:page-layout-name', layout)}`;
    this.masters.add(master, stories ? `${open}>${stories}</style:master-page>` : `${open}/>`);
    return master;
  }

  /** A page layout for a setup: with a header or footer shown, its margins and their styles as `headerLayout` gives. */
  pageLayoutXml(
    name: string,
    setup: PageSetup,
    residue: readonly KeptXml[],
    shown: { header: boolean; footer: boolean },
  ): string {
    const isStyle = (kind: string) => (r: KeptXml) =>
      new RegExp(`^<[^>]*${kind}-style`).test(r.xml);
    const inner = residue
      .filter((r) => !isStyle('header')(r) && !isStyle('footer')(r))
      .map((r) => this.kept(r))
      .join('');
    const laid = headerLayout(setup, shown);
    const keptStyle = (kind: 'header' | 'footer') =>
      shown[kind]
        ? ''
        : residue
            .filter(isStyle(kind))
            .map((r) => this.kept(r))
            .join('');
    const ownStyles = laid.styles;
    const header = shown.header
      ? ownStyles.match(/<style:header-style>[\s\S]*?<\/style:header-style>/)![0]
      : keptStyle('header');
    const footer = shown.footer
      ? ownStyles.match(/<style:footer-style>[\s\S]*?<\/style:footer-style>/)![0]
      : keptStyle('footer');
    return `<style:page-layout${attr('style:name', name)}>${pageLayoutPropsXml(laid.setup, inner)}${header}${footer}</style:page-layout>`;
  }

  namedStyleXml(style: Style): string {
    const { kept, ...values } = style;
    if (kept && keptStillHolds(kept, values)) return this.kept(kept.xml);
    const { outlineLevel, ...paragraph } = stopsWritten(
      this.tabs,
      { style: style.parent, props: style.paragraph },
      this.tabsFromIndent,
    );
    this.font(style.text);
    const residue = (kept?.residue ?? []).map((r) => this.kept(r)).join('');
    return `<style:style${attr('style:name', style.id)}${attr('style:display-name', style.name === style.id ? undefined : style.name)} style:family="${style.family}"${attr('style:parent-style-name', style.parent)}${attr('style:next-style-name', style.next)}${attr('style:default-outline-level', outlineLevel ? String(outlineLevel) : undefined)}>${style.family === 'paragraph' ? paragraphPropsXml(paragraph) : ''}${textPropsXml(style.text)}${residue}</style:style>`;
  }

  defaultStyleXml(): string {
    const { kept, ...values } = this.document.defaults;
    if (kept && keptStillHolds(kept, values)) return this.kept(kept.xml);
    this.font(values.text);
    const own = values.paragraph.tabStops;
    const paragraph =
      own && this.tabsFromIndent
        ? {
            ...values.paragraph,
            tabStops: TabStops.shift(own, -(values.paragraph.indentStart ?? 0)),
          }
        : values.paragraph;
    return `<style:default-style style:family="paragraph">${paragraphPropsXml(paragraph)}${textPropsXml(values.text)}${(kept?.residue ?? []).map((r) => this.kept(r)).join('')}</style:default-style>`;
  }
}

/** The body as `office:text`'s content. */
function bodyXml(w: OdfWriter): string {
  return contentXml(w, w.document.body, false);
}

// Paragraph properties with the number a page starts at, as `style:page-number`.
function withPageNumber(propsXml: string, start: number | undefined): string {
  if (start === undefined) return propsXml;
  const number = attr('style:page-number', String(start));
  return propsXml.startsWith('<style:paragraph-properties')
    ? propsXml.replace('<style:paragraph-properties', `<style:paragraph-properties${number}`)
    : `<style:paragraph-properties${number}/>`;
}

/** A header's or footer's blocks as a master page's element's content, their automatic styles in styles.xml. */
function storyContentXml(w: OdfWriter, blocks: readonly Block[]): string {
  const outer = w.automatic;
  w.automatic = w.pageStyles;
  const xml = contentXml(w, blocks, true);
  w.automatic = outer;
  return xml;
}

/** Blocks as `office:text`'s content, or, for a header (`story`), without master pages. */
function contentXml(w: OdfWriter, blocks: readonly Block[], story: boolean): string {
  const doc = w.document;
  const out: string[] = [];
  const firstMaster = story ? undefined : w.master(doc.section);
  let pendingMaster: string | undefined = firstMaster === 'Standard' ? undefined : firstMaster;
  let pendingStart = story ? undefined : doc.section.numberStart;
  let isFirstParagraph = !story;
  let regionOpen: string | undefined;
  const lists = new ListWriter(w, out);
  const listsSeen = new Set<string>();

  const paragraphXml = (p: Paragraph): string => {
    const first = isFirstParagraph;
    const start = pendingStart;
    // A start needs its page: the first paragraph names the document's master page with it, as LibreOffice does.
    const master = pendingMaster ?? (first && start !== undefined ? firstMaster : undefined);
    pendingMaster = undefined;
    pendingStart = undefined;
    isFirstParagraph = false;
    const style = w.paragraphStyle(p, master, first, start);
    const outline = p.props.outlineLevel ?? Styles.outlineLevel(doc.styles, p.style);
    const segments: Segment[] = p.inlines.map((i) => {
      const span = w.textStyle(i);
      if (i.type === 'run')
        return { kind: 'text', text: i.text, ...compact({ span, link: i.link }) };
      const xml =
        i.type === 'field'
          ? odfFieldXml(i)
          : i.type === 'note'
            ? odfFootnoteXml(
                w.noteNumbers.get(i) ?? w.noteNumbers.size + 1,
                contentXml(w, i.blocks, true),
              )
            : w.kept(i.xml);
      return { kind: 'kept', xml, ...compact({ span, link: i.link }) };
    });
    const tag = outline !== undefined && outline >= 1 ? 'text:h' : 'text:p';
    const level = tag === 'text:h' ? attr('text:outline-level', String(outline)) : '';
    return `<${tag}${attr('text:style-name', style)}${level}>${paragraphContentXml(segments)}</${tag}>`;
  };

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    if (block.type === 'paragraph' && block.list) {
      lists.paragraph(block, paragraphXml(block), listsSeen);
      continue;
    }
    lists.close();
    if (block.type === 'paragraph') out.push(paragraphXml(block));
    else if (block.type === 'kept') out.push(w.kept(block.xml));
    else {
      if (regionOpen) {
        out.push(`</${regionOpen}>`);
        regionOpen = undefined;
      }
      if (block.start === 'continuous') {
        const open = sectionOpen(w, block);
        if (open) {
          out.push(open.xml);
          regionOpen = open.close;
        }
      } else {
        pendingMaster = w.master(block);
        pendingStart = block.numberStart;
        const next = blocks[i + 1];
        if (!next || next.type !== 'paragraph')
          out.push(
            paragraphXml(Paragraphs.of('', Styles.idOfRole(doc.styles, 'normal') ?? 'Standard')),
          );
      }
    }
  }
  lists.close();
  if (regionOpen) out.push(`</${regionOpen}>`);
  return out.join('\n');
}

// A section style holding these columns: the kept one's copy when there is one, else LiveDoc's own. The columns go
// where the schema has them, after a background picture and before notes configurations.
function sectionStyleXml(name: string, columns: Columns | undefined, kept?: string): string {
  const inner = columnsXml(columns);
  const props = kept?.match(/<style:section-properties\b([^>]*?)(\/?)>/);
  if (!kept || !props) {
    return `<style:style${attr('style:name', name)} style:family="section"><style:section-properties>${inner}</style:section-properties></style:style>`;
  }
  const renamed = kept
    .replace(/\sstyle:name="[^"]*"/, attr('style:name', name))
    .replace(/<style:columns\b[^>]*?(?:\/>|>[\s\S]*?<\/style:columns>)/, '');
  if (props[2]) {
    return renamed.replace(
      props[0],
      `<style:section-properties${props[1]}>${inner}</style:section-properties>`,
    );
  }
  const picture = renamed.match(
    /<style:background-image\b[^>]*?(?:\/>|>[\s\S]*?<\/style:background-image>)/,
  );
  const at = picture
    ? renamed.indexOf(picture[0]) + picture[0].length
    : renamed.indexOf(props[0]) + props[0].length;
  return renamed.slice(0, at) + inner + renamed.slice(at);
}

// The columns a kept section style's XML holds.
function columnsInStyle(xml: string | undefined): Columns | undefined {
  const count = Number(xml?.match(/<style:columns\b[^>]*\sfo:column-count="(\d+)"/)?.[1]);
  if (!xml || !(count > 1)) return undefined;
  const gap = odfLengthToPt(xml.match(/<style:columns\b[^>]*\sfo:column-gap="([^"]*)"/)?.[1]) ?? 0;
  const sep = xml.match(/<style:column-sep\b[^>]*?(?:\sstyle:style="([^"]*)")?[^>]*\/?>/);
  return { count, gap, ...(sep && sep[1] !== 'none' ? { separator: true as const } : {}) };
}

function sectionOpen(
  w: OdfWriter,
  block: SectionBreak,
): { xml: string; close: string } | undefined {
  if (block.region) {
    const xml = keptXmlWithin(block.region, w.ns);
    const close = xml.match(/^<([^\s>/]+)/)![1]!;
    // A region keeps its own style while its columns are as it named them; else a copy of it with the new columns.
    const named = xml.match(/\stext:style-name="([^"]*)"/)?.[1];
    const own = named === undefined ? undefined : w.automatic.byName.get(named);
    if (Columns.equal(Columns.of({ columns: columnsInStyle(own) }), Columns.of(block.setup)))
      return { xml, close };
    const style = w.generated('LDS', (name) => sectionStyleXml(name, block.setup.columns, own));
    const restyled =
      named === undefined
        ? xml.replace(/^<([^\s>/]+)/, `<$1${attr('text:style-name', style)}`)
        : xml.replace(/\stext:style-name="[^"]*"/, attr('text:style-name', style));
    return { xml: restyled, close };
  }
  if (!block.setup.columns || block.setup.columns.count < 2) return undefined;
  const style = w.generated('LDS', (name) => sectionStyleXml(name, block.setup.columns));
  return {
    xml: `<text:section${attr('text:style-name', style)}${attr('text:name', style)}>`,
    close: 'text:section',
  };
}

/** Consecutive paragraphs of a list as nested `text:list` and `text:list-item` elements. */
class ListWriter {
  #id: string | undefined;
  #depth = -1;
  #itemOpen: boolean[] = [];

  readonly w: OdfWriter;
  readonly out: string[];

  constructor(w: OdfWriter, out: string[]) {
    this.w = w;
    this.out = out;
  }

  close(): void {
    while (this.#depth >= 0) this.pop();
    this.#id = undefined;
  }

  pop(): void {
    if (this.#itemOpen[this.#depth]) this.out.push('</text:list-item>');
    this.out.push('</text:list>');
    this.#itemOpen.pop();
    this.#depth -= 1;
  }

  paragraph(p: Paragraph, xml: string, seen: Set<string>): void {
    const place = p.list!;
    if (this.#id !== place.id) {
      this.close();
      this.#id = place.id;
    }
    const level = Math.max(0, Math.min(8, place.level));
    while (this.#depth > level) this.pop();
    while (this.#depth < level) {
      if (this.#depth >= 0 && !this.#itemOpen[this.#depth]) {
        this.out.push('<text:list-item>');
        this.#itemOpen[this.#depth] = true;
      }
      this.#depth += 1;
      if (this.#depth === 0) {
        const style = this.w.listStyle(place.id, this.w.document.lists[place.id]);
        const xmlId = /^[A-Za-z_][\w.-]*$/.test(place.id)
          ? place.id
          : `list-${place.id.replace(/[^\w.-]/g, '_')}`;
        const link = seen.has(place.id) ? attr('text:continue-list', xmlId) : attr('xml:id', xmlId);
        seen.add(place.id);
        this.out.push(`<text:list${link}${attr('text:style-name', style)}>`);
      } else this.out.push('<text:list>');
      this.#itemOpen[this.#depth] = false;
    }
    if (place.unnumbered && this.#itemOpen[level]) {
      this.out.push(xml);
      return;
    }
    if (this.#itemOpen[level]) this.out.push('</text:list-item>');
    if (place.unnumbered) this.out.push(`<text:list-header>${xml}</text:list-header>`);
    else
      this.out.push(
        `<text:list-item${attr('text:start-value', place.restart === undefined ? undefined : String(place.restart))}${attr('livedoc:checked', place.checked ? 'true' : undefined)}>${xml}`,
      );
    this.#itemOpen[level] = !place.unnumbered;
  }
}

const declarations = (ns: Readonly<Record<string, string>>) =>
  Object.entries(ns)
    .map(([p, uri]) => ` xmlns:${p}="${escapeXmlAttribute(uri)}"`)
    .join('');

export type OdfWritten = {
  content: string;
  styles: string;
  meta: string;
  settings: string;
  flat: string;
};

function writeParts(document: TextDocument, generator: string): OdfWritten {
  const w = new OdfWriter(document);
  w.storyXml = (blocks) => storyContentXml(w, blocks);
  const text = bodyXml(w);
  const named = [
    w.defaultStyleXml(),
    ...document.styles.map((s) => w.namedStyleXml(s)),
    ...(w.source?.styles ?? []).map((s) => w.kept(s)),
  ].join('');
  const root = `${declarations(w.ns)} office:version="${ODF_VERSION}"`;
  const faces = `<office:font-face-decls>${w.fontFaces.join('')}</office:font-face-decls>`;
  const meta = odfMetaChildren(
    document.metadata,
    statisticsOf(TextDocument.paragraphTexts(document)),
    generator,
    w.ns,
  );
  // A new text document counts its tab positions from the text area's start, as the model does.
  const settings = withPageless(
    w.source ? (w.source.settings ? w.kept(w.source.settings) : '') : ABSOLUTE_TABS_SETTINGS,
    document.pageless,
  );
  const masters = `<office:master-styles>${w.masters.xml()}</office:master-styles>`;
  const body = `<office:body><office:text>\n${text}\n</office:text></office:body>`;
  const content = `${XML_DECLARATION}\n<office:document-content${root}>${faces}<office:automatic-styles>${w.contentAutomatic.xml()}</office:automatic-styles>${body}</office:document-content>\n`;
  const styles = `${XML_DECLARATION}\n<office:document-styles${root}>${faces}<office:styles>${named}</office:styles><office:automatic-styles>${w.pageStyles.xml()}</office:automatic-styles>${masters}</office:document-styles>\n`;
  const metaXml = `${XML_DECLARATION}\n<office:document-meta${root}><office:meta>${meta}</office:meta></office:document-meta>\n`;
  const settingsXml = `${XML_DECLARATION}\n<office:document-settings${root}${settings ? `>${settings}</office:document-settings>` : '/>'}\n`;
  const allAutomatic = new Named();
  for (const name of w.pageStyles.order) allAutomatic.add(name, w.pageStyles.byName.get(name)!);
  for (const name of w.contentAutomatic.order)
    allAutomatic.add(name, w.contentAutomatic.byName.get(name)!);
  const flat = `${XML_DECLARATION}\n<office:document${root}${attr('office:mimetype', ODF_MEDIA_TYPES.text)}><office:meta>${meta}</office:meta>${settings}${faces}<office:styles>${named}</office:styles><office:automatic-styles>${allAutomatic.xml()}</office:automatic-styles>${masters}${body}</office:document>\n`;
  return { content, styles, meta: metaXml, settings: settingsXml, flat };
}

const WRITTEN_ENTRIES = new Set([
  'content.xml',
  'styles.xml',
  'meta.xml',
  'settings.xml',
  'mimetype',
  'META-INF/manifest.xml',
]);

/** The text document as an ODF package (`.odt`) or flat file (`.fodt`). */
export function writeOdf(document: TextDocument, { flat, generator }: OdfWriteOptions): Uint8Array {
  const parts = writeParts(document, generator);
  const encode = (text: string) => new TextEncoder().encode(text);
  if (flat) return encode(parts.flat);
  const kept =
    document.source?.format === 'odf'
      ? document.source.entries.filter((e) => !WRITTEN_ENTRIES.has(e.name))
      : [];
  return writeOdfPackage(ODF_MEDIA_TYPES.text, [
    { name: 'content.xml', mediaType: 'text/xml', data: encode(parts.content) },
    { name: 'styles.xml', mediaType: 'text/xml', data: encode(parts.styles) },
    { name: 'meta.xml', mediaType: 'text/xml', data: encode(parts.meta) },
    { name: 'settings.xml', mediaType: 'text/xml', data: encode(parts.settings) },
    ...[...kept]
      .sort((a, b) => (a.name < b.name ? -1 : 1))
      .map((e) => ({ name: e.name, mediaType: e.mediaType, data: e.data })),
  ]);
}
