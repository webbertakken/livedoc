// The text document as plain values (docs/specs/034-text-documents/standard-mapping.md "The model"): its format,
// metadata, styles, lists, first section, body and document tabs, and what its file kept that the model does not map.
import type {
  DocumentMetadata,
  KeptXml,
  Relationship,
  XmlBindings,
} from '@livedoc/office-packages';
import { Paragraph, type Block } from './blocks';
import { Blocks } from './tables';
import type { ListDefinition } from './lists';
import { PageSetup, type PaperName, type Section } from './sections';
import { Styles, type Style, type StyleDefaults } from './styles';
import type { Watermark } from './watermark';
import type { DocumentMedia } from './pictures';
import { DocumentTabs } from './document-tabs';

export type TextDocumentFormat = 'odf' | 'ooxml';

export type KeptEntry = {
  readonly name: string;
  readonly mediaType: string;
  readonly data: Uint8Array;
};

/** What an ODF file kept beyond the model, to write back around it. */
export type OdfSource = {
  readonly format: 'odf';
  /** The arriving roots' namespace declarations. */
  readonly namespaces: XmlBindings;
  readonly fontFaces: readonly KeptXml[];
  /** `office:styles` children the model does not map: list, outline, note and graphic styles, configurations. */
  readonly styles: readonly KeptXml[];
  /** The body's automatic styles, all of them, by name. */
  readonly automaticStyles: readonly { name: string; xml: KeptXml }[];
  /** The styles part's automatic styles (page layouts, header and footer styles), by name. */
  readonly pageStyles: readonly { name: string; xml: KeptXml }[];
  readonly masterStyles: readonly KeptXml[];
  readonly settings?: KeptXml;
  /** Whether its tab positions count from the indent (`TabsRelativeToIndent`, true unless set false). */
  readonly tabsFromIndent?: boolean;
  /** Package entries the model does not map (pictures, embedded objects), with their manifest media types. */
  readonly entries: readonly KeptEntry[];
};

/** What an OOXML file kept beyond the model, to write back around it. */
/** A footnotes part as kept: its name, and the `w:footnote` elements no note was read from, each with its id. */
export type OoxmlFootnotesSource = {
  readonly part: string;
  readonly kept: readonly { readonly id: string; readonly xml: KeptXml }[];
};

export type OoxmlSource = {
  readonly format: 'ooxml';
  readonly mainPart: string;
  readonly mainContentType: string;
  readonly documentNamespaces: XmlBindings;
  /** The document root's `mc:Ignorable` prefixes. */
  readonly ignorable: readonly string[];
  readonly stylesPart?: string;
  readonly stylesNamespaces: XmlBindings;
  /** `w:styles` children the model does not map: latent styles, table and numbering styles. */
  readonly styles: readonly KeptXml[];
  readonly numberingPart?: string;
  readonly numberingNamespaces: XmlBindings;
  /** `w:numbering` children the model does not map (picture bullets). */
  readonly numbering: readonly KeptXml[];
  /** The footnotes part, when the file had one: its name, and the footnotes the model does not hold. */
  readonly footnotes?: OoxmlFootnotesSource;
  /** Every part the model does not map, in the package's order. */
  readonly parts: readonly KeptEntry[];
  /** Every relationship as the package had it, by source part. */
  readonly relationships: ReadonlyMap<string, readonly Relationship[]>;
  readonly defaults: ReadonlyMap<string, string>;
};

export type TextDocument = {
  readonly format: TextDocumentFormat;
  readonly metadata: DocumentMetadata;
  readonly defaults: StyleDefaults;
  readonly styles: readonly Style[];
  readonly lists: Readonly<Record<string, ListDefinition>>;
  /** The first section's setup; later sections start at section breaks in the body. */
  readonly section: Section;
  /** Shown as one continuous column, no pages (page-layout.md "Pageless"); absent is pages. */
  readonly pageless?: true;
  /** Drawn behind the writing on every page (page-layout.md "Watermark"). */
  readonly watermark?: Watermark;
  /** Its pictures' bytes by key (objects.md "The model"). */
  readonly media?: DocumentMedia;
  /** The first document tab's body (standard-mapping.md "Document tabs"). */
  readonly body: readonly Block[];
  /** The document tabs: absent is one tab, `t.0`, Tab 1, whose body is `body`. */
  readonly tabs?: DocumentTabs;
  readonly source?: OdfSource | OoxmlSource;
};

export type BlankOptions = {
  format?: TextDocumentFormat;
  paper?: PaperName;
  title?: string;
};

export const TextDocument = {
  /** A new text document: born in ODF (fork C5), Google's styles, one empty Normal text paragraph. */
  blank: ({ format = 'odf', paper = 'letter', title }: BlankOptions = {}): TextDocument => {
    const styles = Styles.builtIn(format);
    return {
      format,
      metadata: title === undefined ? {} : { title },
      defaults: Styles.defaults(),
      styles,
      lists: {},
      section: { start: 'next-page', setup: PageSetup.of(paper, format) },
      body: [Paragraph.of('', Styles.idOfRole(styles, 'normal')!)],
    };
  },
  /** A new text document holding these paragraphs' texts in Normal text. */
  fromTexts: (texts: readonly string[], options: BlankOptions = {}): TextDocument => {
    const blank = TextDocument.blank(options);
    const normal = Styles.idOfRole(blank.styles, 'normal')!;
    return {
      ...blank,
      body: (texts.length > 0 ? texts : ['']).map((t) => Paragraph.of(t, normal)),
    };
  },
  /** Every paragraph of every document tab in reading order, those in table cells included. */
  paragraphs: (document: TextDocument): Paragraph[] =>
    Blocks.paragraphs(DocumentTabs.blocks(document)),
  /** Each paragraph's characters, in order. */
  paragraphTexts: (document: TextDocument): string[] =>
    TextDocument.paragraphs(document).map(Paragraph.text),
  characters: (document: TextDocument): number =>
    TextDocument.paragraphTexts(document).reduce((n, t) => n + t.length, 0),
} as const;
