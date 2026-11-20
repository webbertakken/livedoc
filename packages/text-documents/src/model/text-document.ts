// The text document as plain values (docs/specs/034-text-documents/standard-mapping.md "The model"): its format,
// metadata, styles, lists, first section, body, and what its file kept that the model does not map.
import type {
  DocumentMetadata,
  KeptXml,
  Relationship,
  XmlBindings,
} from '@livedoc/office-packages';
import { Paragraph, type Block } from './blocks';
import type { ListDefinition } from './lists';
import { PageSetup, type PaperName, type Section } from './sections';
import { Styles, type Style, type StyleDefaults } from './styles';

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
  readonly body: readonly Block[];
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
  paragraphs: (document: TextDocument) =>
    document.body.filter((b): b is Paragraph => b.type === 'paragraph'),
  /** Each paragraph's characters, in order. */
  paragraphTexts: (document: TextDocument): string[] =>
    TextDocument.paragraphs(document).map(Paragraph.text),
  characters: (document: TextDocument): number =>
    TextDocument.paragraphTexts(document).reduce((n, t) => n + t.length, 0),
} as const;
