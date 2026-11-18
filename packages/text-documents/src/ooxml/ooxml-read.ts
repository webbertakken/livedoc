// Reading an OOXML text document (standard-mapping.md): a WordprocessingML container into the model, every part and
// construct it does not map kept to write back, fields that run things dropped with their shown text kept.
import {
  attributeOf,
  childElement,
  childElements,
  keptXmlOf,
  OOXML_CONTENT_TYPES,
  ooxmlColour,
  parseXml,
  readOoxmlMetadata,
  readOoxmlPackage,
  refuse,
  RELATIONSHIP_TYPES,
  resolvePartName,
  serializeXml,
  textContent,
  type KeptXml,
  type OoxmlPackage,
  type PackageBudgets,
  type PackageRefusal,
  type Relationship,
  type XmlElement,
  type XmlNode,
  type XmlParsed,
} from '@livedoc/office-packages';
import type { Block, Inline, Paragraph, Run } from '../model/blocks';
import type { ListDefinition, ListPlace } from '../model/lists';
import { canonical, compact, type KeptProperties, type TextProps } from '../model/props';
import type { Section } from '../model/sections';
import { roleOfStyleName, type Style, type StyleDefaults } from '../model/styles';
import type { OoxmlSource, TextDocument } from '../model/text-document';
import { isSafeLink, type ReportBuilder } from '../report';
import { sortedBindings } from '../odf/odf-read';
import { LIVEDOC_NS } from '../odf/odf-names';
import { MC_NS, R_NS, W_NS, W_STRICT_NS, WRITTEN_W_NS } from './ooxml-names';
import {
  MAPPED_PPR,
  MAPPED_RPR,
  MAPPED_SECTPR,
  readLevels,
  readParagraphProps,
  readRunProps,
  readSection,
} from './ooxml-props';

const DOCUMENT_TYPES: readonly string[] = [
  OOXML_CONTENT_TYPES.document,
  OOXML_CONTENT_TYPES.template,
  OOXML_CONTENT_TYPES.macroDocument,
  OOXML_CONTENT_TYPES.macroTemplate,
];

const STRICT_R_NS = 'http://purl.oclc.org/ooxml/officeDocument/relationships';

/** Reads Strict's names as Transitional's, in place. */
function transitional(node: XmlElement): void {
  const fix = (uri: string) => (uri === W_STRICT_NS ? W_NS : uri === STRICT_R_NS ? R_NS : uri);
  const e = node as unknown as { uri: string; attributes: { uri: string }[]; children: XmlNode[] };
  e.uri = fix(e.uri);
  for (const a of e.attributes) a.uri = fix(a.uri);
  for (const c of e.children) if (typeof c !== 'string') transitional(c);
}

const isW = (e: XmlNode, local: string): boolean =>
  typeof e !== 'string' && e.uri === W_NS && e.local === local;
const wVal = (e: XmlElement | undefined, local = 'val') =>
  e ? attributeOf(e, W_NS, local) : undefined;

// Field instructions that run things or fetch from elsewhere (files-and-print.md "Import security").
const UNSAFE_FIELD = /^\s*(DDE|DDEAUTO|INCLUDETEXT|INCLUDEPICTURE|LINK|IMPORT)\b/i;

type Parts = { document: XmlParsed; styles?: XmlParsed; numbering?: XmlParsed };

export type OoxmlFileRead = { ok: true; document: TextDocument } | PackageRefusal;

/** Reads a WordprocessingML text document. */
export async function readOoxmlFile(
  bytes: Uint8Array<ArrayBuffer>,
  report: ReportBuilder,
  budgets?: PackageBudgets,
): Promise<OoxmlFileRead> {
  const read = await readOoxmlPackage(bytes, budgets);
  if (!read.ok) return read;
  const pkg = read.package;
  if (!DOCUMENT_TYPES.includes(pkg.mediaType)) return refuse('package_wrong_type');
  for (const name of pkg.dropped)
    report.drop(
      /signature/.test(name)
        ? 'signature'
        : /thumbnail/.test(name)
          ? 'thumbnail'
          : /oleObject/.test(name)
            ? 'ole-object'
            : /activeX/.test(name)
              ? 'active-content'
              : 'macro',
      name,
    );
  for (const rel of pkg.external)
    if (rel.type !== RELATIONSHIP_TYPES.hyperlink)
      report.drop('external', rel.type.split('/').pop() ?? 'external');
  const parse = (name: string | undefined): XmlParsed | PackageRefusal | undefined => {
    const data = name === undefined ? undefined : pkg.parts.get(name);
    if (data === undefined) return undefined;
    const parsed = parseXml(new TextDecoder().decode(data), name);
    if (parsed.ok) transitional(parsed.root);
    return parsed;
  };
  const mainRels = pkg.relationships.get(pkg.mainPart) ?? [];
  const partOf = (type: string) => {
    const rel = mainRels.find((r) => r.type === type && !r.external);
    return rel && resolvePartName(pkg.mainPart, rel.target);
  };
  const stylesPart = partOf(RELATIONSHIP_TYPES.styles);
  const numberingPart = partOf(RELATIONSHIP_TYPES.numbering);
  const corePart = (pkg.relationships.get('') ?? []).find(
    (r) => r.type === RELATIONSHIP_TYPES.coreProperties,
  );
  const appPart = (pkg.relationships.get('') ?? []).find(
    (r) => r.type === RELATIONSHIP_TYPES.extendedProperties,
  );
  const coreName = corePart && resolvePartName('', corePart.target);
  const appName = appPart && resolvePartName('', appPart.target);
  const parsed = [
    parse(pkg.mainPart),
    parse(stylesPart),
    parse(numberingPart),
    parse(coreName),
    parse(appName),
  ];
  const refused = parsed.find((p): p is PackageRefusal => p !== undefined && !p.ok);
  if (refused) return refused;
  const [document, styles, numbering, core, app] = parsed as (XmlParsed | undefined)[];
  const body = document && childElement(document.root, W_NS, 'body');
  if (!document || !body) return refuse('package_damaged', { entry: pkg.mainPart });
  const reader = new OoxmlReader({ document, ...compact({ styles, numbering }) }, pkg, report);
  return {
    ok: true,
    document: reader.read(body, {
      stylesPart,
      numberingPart,
      coreName,
      appName,
      metadata: readOoxmlMetadata(core, app),
    }),
  };
}

class OoxmlReader {
  readonly parts: Parts;
  readonly pkg: OoxmlPackage;
  readonly report: ReportBuilder;
  readonly rels: readonly Relationship[];

  constructor(parts: Parts, pkg: OoxmlPackage, report: ReportBuilder) {
    this.parts = parts;
    this.pkg = pkg;
    this.report = report;
    this.rels = pkg.relationships.get(pkg.mainPart) ?? [];
  }

  kept(parsed: XmlParsed, e: XmlElement): KeptXml {
    const unsafe = (x: XmlElement) =>
      (x.uri === W_NS && x.local === 'instrText' && UNSAFE_FIELD.test(textContent(x))) ||
      (x.uri === W_NS && x.local === 'fldSimple' && UNSAFE_FIELD.test(wVal(x, 'instr') ?? ''));
    const has = (x: XmlElement): boolean => childElements(x).some((c) => unsafe(c) || has(c));
    if (!unsafe(e) && !has(e)) return keptXmlOf(parsed, e);
    const omit = (x: XmlElement) => {
      if (!unsafe(x)) return false;
      this.report.drop('field', 'field');
      return true;
    };
    return { xml: serializeXml(e, omit), ns: keptXmlOf(parsed, e).ns };
  }

  propsKept(
    parsed: XmlParsed,
    e: XmlElement | undefined,
    values: unknown,
    mapped: ReadonlySet<string>,
  ): KeptProperties | undefined {
    if (!e) return undefined;
    const residue = childElements(e)
      .filter((c) => !(c.uri === W_NS && mapped.has(c.local)))
      .map((c) => keptXmlOf(parsed, c));
    return { xml: keptXmlOf(parsed, e), read: canonical(values), residue };
  }

  readStyles(): { styles: Style[]; defaults: StyleDefaults; kept: KeptXml[] } {
    const parsed = this.parts.styles;
    const out: Style[] = [];
    const kept: KeptXml[] = [];
    let defaults: StyleDefaults = { paragraph: {}, text: {} };
    for (const e of parsed ? childElements(parsed.root) : []) {
      if (isW(e, 'docDefaults')) {
        const pPr = childElement(childElement(e, W_NS, 'pPrDefault') ?? e, W_NS, 'pPr');
        const rPr = childElement(childElement(e, W_NS, 'rPrDefault') ?? e, W_NS, 'rPr');
        const values = { paragraph: readParagraphProps(pPr), text: readRunProps(rPr).props };
        defaults = {
          ...values,
          kept: { xml: keptXmlOf(parsed!, e), read: canonical(values), residue: [] },
        };
        continue;
      }
      const type = wVal(e, 'type');
      if (!isW(e, 'style') || (type !== 'paragraph' && type !== 'character')) {
        kept.push(keptXmlOf(parsed!, e));
        continue;
      }
      const id = wVal(e, 'styleId') ?? '';
      const name = wVal(childElement(e, W_NS, 'name')) ?? id;
      const values = compact({
        id,
        name,
        family: type === 'character' ? ('text' as const) : ('paragraph' as const),
        parent: wVal(childElement(e, W_NS, 'basedOn')),
        next: wVal(childElement(e, W_NS, 'next')),
        role: type === 'paragraph' ? (roleOfStyleName(name) ?? roleOfStyleName(id)) : undefined,
        paragraph: readParagraphProps(childElement(e, W_NS, 'pPr')),
        text: readRunProps(childElement(e, W_NS, 'rPr')).props,
      });
      const residue = childElements(e)
        .filter(
          (c) => !(c.uri === W_NS && ['name', 'basedOn', 'next', 'pPr', 'rPr'].includes(c.local)),
        )
        .map((c) => keptXmlOf(parsed!, c));
      out.push({
        ...values,
        kept: { xml: keptXmlOf(parsed!, e), read: canonical(values), residue },
      });
    }
    return { styles: out, defaults, kept };
  }

  readLists(): { lists: Record<string, ListDefinition>; kept: KeptXml[] } {
    const parsed = this.parts.numbering;
    const lists: Record<string, ListDefinition> = {};
    const kept: KeptXml[] = [];
    if (!parsed) return { lists, kept };
    const abstracts = new Map<string, XmlElement>();
    for (const e of childElements(parsed.root))
      if (isW(e, 'abstractNum')) abstracts.set(wVal(e, 'abstractNumId') ?? '', e);
    for (const e of childElements(parsed.root)) {
      if (isW(e, 'abstractNum')) continue;
      if (!isW(e, 'num')) {
        kept.push(keptXmlOf(parsed, e));
        continue;
      }
      const id = wVal(e, 'numId') ?? '';
      const abstractId = wVal(childElement(e, W_NS, 'abstractNumId')) ?? '';
      const abstract = abstracts.get(abstractId);
      const levels = readLevels(abstract, e);
      lists[id] = {
        levels,
        kept: {
          xml: keptXmlOf(parsed, e),
          read: canonical(levels),
          residue: abstract ? [keptXmlOf(parsed, abstract)] : [],
          name: abstractId,
        },
      };
    }
    return { lists, kept };
  }

  read(
    body: XmlElement,
    names: {
      stylesPart?: string;
      numberingPart?: string;
      coreName?: string;
      appName?: string;
      metadata: TextDocument['metadata'];
    },
  ): TextDocument {
    const doc = this.parts.document;
    const { styles, defaults, kept: keptStyles } = this.readStyles();
    const { lists, kept: keptNumbering } = this.readLists();
    const pageColor = ooxmlColour(wVal(childElement(doc.root, W_NS, 'background'), 'color'));
    // The page colour is the whole document's in OOXML (`w:background`): it is the first section's in the model.
    const sectionOf = (sectPr: XmlElement, at: number): Section => {
      const values = readSection(sectPr, at === 0 ? pageColor : undefined);
      return { ...values, kept: this.propsKept(doc, sectPr, values, MAPPED_SECTPR)! };
    };
    const elements = childElements(body);
    const finalSectPr = elements.findLast((e) => isW(e, 'sectPr'));
    const sectPrs = elements.flatMap((e) => {
      const s = isW(e, 'p')
        ? childElement(childElement(e, W_NS, 'pPr') ?? e, W_NS, 'sectPr')
        : undefined;
      return s && isW(e, 'p') ? [s] : [];
    });
    const all = [...sectPrs, ...(finalSectPr ? [finalSectPr] : [])];
    const sections = all.map((s, at) => sectionOf(s, at));
    const first: Section = sections[0] ?? {
      start: 'next-page',
      setup: readSection(
        {
          uri: W_NS,
          local: 'sectPr',
          prefix: 'w',
          attributes: [],
          children: [],
          declared: {},
          scope: {},
          start: 0,
          end: 0,
        },
        pageColor,
      ).setup,
    };
    const blocks: Block[] = [];
    let sectionAt = 0;
    for (const e of elements) {
      if (isW(e, 'p')) {
        const ends = childElement(childElement(e, W_NS, 'pPr') ?? e, W_NS, 'sectPr') !== undefined;
        // A paragraph holding a `w:sectPr` ends the section that sectPr describes; the next one starts after it.
        const next = ends ? sections[sectionAt + 1] : undefined;
        blocks.push(this.paragraph(e, ends ? sections[sectionAt] : undefined));
        if (ends) {
          sectionAt += 1;
          if (next) blocks.push({ type: 'section', ...next });
        }
      } else if (isW(e, 'sectPr')) continue;
      else if (isW(e, 'proofErr')) this.report.drop('layout-hint', e.local);
      else {
        blocks.push({ type: 'kept', name: e.local, xml: this.kept(doc, e) });
        this.report.keep(e.local);
      }
    }
    if (!blocks.some((b) => b.type === 'paragraph'))
      blocks.push({
        type: 'paragraph',
        style: styles.find((s) => s.role === 'normal')?.id ?? 'Normal',
        props: {},
        inlines: [],
      });
    const ignorable = (attributeOf(doc.root, MC_NS, 'Ignorable') ?? '')
      .split(/\s+/)
      .filter((p) => p && p !== 'livedoc');
    const source: OoxmlSource = {
      format: 'ooxml',
      mainPart: this.pkg.mainPart,
      mainContentType: this.pkg.mediaType,
      documentNamespaces: withoutWritten(doc.root.scope),
      ignorable,
      ...compact({ stylesPart: names.stylesPart, numberingPart: names.numberingPart }),
      stylesNamespaces: withoutWritten(this.parts.styles?.root.scope ?? {}),
      styles: keptStyles,
      numberingNamespaces: withoutWritten(this.parts.numbering?.root.scope ?? {}),
      numbering: keptNumbering,
      parts: [...this.pkg.parts]
        .filter(
          ([name]) =>
            ![
              this.pkg.mainPart,
              names.stylesPart,
              names.numberingPart,
              names.coreName,
              names.appName,
            ].includes(name),
        )
        .map(([name, data]) => ({
          name,
          data,
          mediaType: this.pkg.contentTypes.get(name) ?? 'application/octet-stream',
        })),
      relationships: new Map([...this.pkg.relationships].map(([from, rels]) => [from, byId(rels)])),
      // Every written package defaults `rels` and `xml`; the rest by extension, sorted.
      defaults: new Map(
        [...this.pkg.defaults]
          .filter(([ext]) => ext !== 'rels' && ext !== 'xml')
          .sort(([a], [b]) => (a < b ? -1 : 1)),
      ),
    };
    return {
      format: 'ooxml',
      metadata: names.metadata,
      defaults,
      styles,
      lists,
      section: first,
      body: blocks,
      source,
    };
  }

  paragraph(p: XmlElement, endsWith: Section | undefined): Paragraph {
    const doc = this.parts.document;
    const pPr = childElement(p, W_NS, 'pPr');
    const numPr = pPr && childElement(pPr, W_NS, 'numPr');
    const numId = wVal(childElement(numPr ?? p, W_NS, 'numId'));
    const level = Number(wVal(childElement(numPr ?? p, W_NS, 'ilvl')) ?? '0');
    const checked = attributeOf(p, LIVEDOC_NS, 'checked') === 'true';
    const list: ListPlace | undefined =
      numId !== undefined && numId !== '0'
        ? compact({
            id: numId,
            level: Math.max(0, Math.min(8, level || 0)),
            checked: checked || undefined,
          })
        : undefined;
    const style = wVal(childElement(pPr ?? p, W_NS, 'pStyle')) ?? this.normalId();
    const props = readParagraphProps(pPr);
    const values = {
      style,
      props,
      list: list && { id: list.id, level: list.level },
      section: endsWith && { start: endsWith.start, setup: endsWith.setup },
    };
    const kept = this.propsKept(doc, pPr, values, MAPPED_PPR);
    return {
      type: 'paragraph',
      style,
      props,
      ...compact({ list, kept }),
      inlines: new RunReader(this, p).read(),
    };
  }

  normalId(): string {
    const styles = this.parts.styles;
    const normal =
      styles &&
      childElements(styles.root).find(
        (e) => isW(e, 'style') && wVal(e, 'type') === 'paragraph' && wVal(e, 'default') === '1',
      );
    return (normal && wVal(normal, 'styleId')) ?? 'Normal';
  }

  linkOf(e: XmlElement): string | undefined {
    const anchor = wVal(e, 'anchor');
    if (anchor !== undefined) return `#${anchor}`;
    const id = attributeOf(e, R_NS, 'id');
    return this.rels.find((r) => r.id === id)?.target;
  }
}

/** Relationships in the order of their ids, so a package reads the same whichever order it listed them in. */
export const byId = (rels: readonly Relationship[]): Relationship[] =>
  [...rels].sort(
    (a, b) => idNumber(a.id) - idNumber(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

const idNumber = (id: string) => Number(id.match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);

function withoutWritten(scope: Readonly<Record<string, string>>): Record<string, string> {
  return sortedBindings(
    Object.fromEntries(Object.entries(scope).filter(([p, uri]) => WRITTEN_W_NS[p] !== uri)),
  );
}

type RunContext = { link?: string };

class RunReader {
  readonly out: Inline[] = [];
  readonly r: OoxmlReader;
  readonly p: XmlElement;
  readonly skipped = new Set<XmlElement>();

  constructor(r: OoxmlReader, p: XmlElement) {
    this.r = r;
    this.p = p;
    this.markUnsafeFields();
  }

  /** Complex fields whose instruction runs things: their begin, instruction, separator and end runs are skipped. */
  markUnsafeFields(): void {
    const runs: XmlElement[] = [];
    const collect = (e: XmlElement) => {
      for (const c of childElements(e)) {
        if (isW(c, 'r')) runs.push(c);
        else if (!isW(c, 'p')) collect(c);
      }
    };
    collect(this.p);
    const stack: { runs: XmlElement[]; instr: string; result: boolean }[] = [];
    for (const run of runs) {
      const char = wVal(childElement(run, W_NS, 'fldChar'), 'fldCharType');
      const instr = childElement(run, W_NS, 'instrText');
      if (char === 'begin') stack.push({ runs: [run], instr: '', result: false });
      else if (stack.length > 0) {
        const top = stack.at(-1)!;
        if (instr && !top.result) {
          top.instr += textContent(instr);
          top.runs.push(run);
        } else if (char === 'separate') {
          top.result = true;
          top.runs.push(run);
        } else if (char === 'end') {
          top.runs.push(run);
          stack.pop();
          if (UNSAFE_FIELD.test(top.instr)) {
            this.r.report.drop('field', top.instr.trim().split(/\s+/)[0]!.toUpperCase());
            for (const skip of top.runs) this.skipped.add(skip);
          }
        }
      }
    }
  }

  read(): Inline[] {
    for (const c of childElements(this.p)) this.node(c, {});
    return this.out;
  }

  push(
    text: string,
    style: string | undefined,
    props: TextProps,
    link: string | undefined,
    kept: KeptProperties | undefined,
  ): void {
    if (!text) return;
    const last = this.out.at(-1);
    if (
      last?.type === 'run' &&
      last.style === style &&
      last.link === link &&
      last.kept === kept &&
      canonical(last.props) === canonical(props)
    ) {
      this.out[this.out.length - 1] = { ...last, text: last.text + text };
      return;
    }
    const run: Run = { type: 'run', text, props, ...compact({ style, link, kept }) };
    this.out.push(run);
  }

  keepInline(
    e: XmlElement,
    ctx: RunContext,
    props: TextProps = {},
    style?: string,
    xml?: KeptXml,
  ): void {
    this.r.report.keep(e.local);
    this.out.push({
      type: 'kept',
      name: e.local,
      xml: xml ?? this.r.kept(this.r.parts.document, e),
      props,
      ...compact({ style, link: ctx.link }),
    });
  }

  node(e: XmlElement, ctx: RunContext): void {
    if (e.uri === W_NS) {
      if (e.local === 'pPr') return;
      if (e.local === 'r') return this.run(e, ctx);
      if (e.local === 'proofErr') {
        this.r.report.drop('layout-hint', e.local);
        return;
      }
      if (e.local === 'hyperlink') {
        const href = this.r.linkOf(e);
        const safe = href !== undefined && isSafeLink(href);
        if (href !== undefined && !safe) this.r.report.drop('link', 'link');
        for (const c of childElements(e)) this.node(c, safe ? { link: href } : {});
        return;
      }
      if (e.local === 'fldSimple' && UNSAFE_FIELD.test(wVal(e, 'instr') ?? '')) {
        this.r.report.drop('field', (wVal(e, 'instr') ?? '').trim().split(/\s+/)[0]!.toUpperCase());
        for (const c of childElements(e)) this.node(c, ctx);
        return;
      }
    }
    this.keepInline(e, ctx);
  }

  run(r: XmlElement, ctx: RunContext): void {
    if (this.skipped.has(r)) return;
    const doc = this.r.parts.document;
    const rPr = childElement(r, W_NS, 'rPr');
    const { style, props } = readRunProps(rPr);
    const kept = this.r.propsKept(doc, rPr, { style, props }, MAPPED_RPR);
    for (const c of childElements(r)) {
      if (c.uri !== W_NS) {
        this.keepWhole(r, rPr, c, ctx, props, style);
        continue;
      }
      switch (c.local) {
        case 'rPr':
          break;
        case 't':
          this.push(textContent(c), style, props, ctx.link, kept);
          break;
        case 'tab':
          this.push('\t', style, props, ctx.link, kept);
          break;
        case 'cr':
          this.push('\n', style, props, ctx.link, kept);
          break;
        case 'noBreakHyphen':
          this.push('\u2011', style, props, ctx.link, kept);
          break;
        case 'softHyphen':
          this.push('\u00ad', style, props, ctx.link, kept);
          break;
        case 'lastRenderedPageBreak':
          this.r.report.drop('layout-hint', c.local);
          break;
        case 'br': {
          const type = wVal(c, 'type');
          if (type === undefined || type === 'textWrapping')
            this.push('\n', style, props, ctx.link, kept);
          else this.keepWhole(r, rPr, c, ctx, props, style);
          break;
        }
        default:
          this.keepWhole(r, rPr, c, ctx, props, style);
      }
    }
  }

  /** A run's unmapped child kept as a run of its own, with the run's formatting inside it. */
  keepWhole(
    r: XmlElement,
    rPr: XmlElement | undefined,
    c: XmlElement,
    ctx: RunContext,
    props: TextProps,
    style: string | undefined,
  ): void {
    const doc = this.r.parts.document;
    const inner = this.r.kept(doc, c);
    const pr = rPr ? keptXmlOf(doc, rPr) : undefined;
    const prefix = r.prefix ? `${r.prefix}:` : '';
    const xml: KeptXml = {
      xml: `<${prefix}r>${pr?.xml ?? ''}${inner.xml}</${prefix}r>`,
      ns: { ...pr?.ns, ...inner.ns, [r.prefix]: r.uri },
    };
    this.keepInline(c, ctx, props, style, xml);
  }
}
