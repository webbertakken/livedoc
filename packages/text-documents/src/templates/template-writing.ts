// The kit a text document template is written with (docs/specs/034-text-documents/starting-and-finding.md "The
// template gallery's text documents"): a template's look (its normal text, its styles restyled by role, its margins)
// and its writing, as plain blocks of the model, made into a text document born in ODF on Letter paper. Pure.
import type { Block, Inline, Paragraph, Run } from '../model/blocks';
import type { ListDefinition } from '../model/lists';
import { ListPresets } from '../model/list-presets';
import type { ParagraphProps, TextProps } from '../model/props';
import type { Margins } from '../model/sections';
import { Styles, type StyleRole } from '../model/styles';
import type { Table, TableCell } from '../model/tables';
import { TextDocument } from '../model/text-document';

/** How a template restyles one built-in style: what it adds to the style's own paragraph and text formatting. */
export type StyleLook = { readonly paragraph?: ParagraphProps; readonly text?: TextProps };

/** A template's look: its normal text, its styles by role, and its margins where they are not an inch. */
export type TemplateLook = {
  readonly text: TextProps;
  readonly paragraph?: ParagraphProps;
  readonly styles?: Partial<Record<StyleRole, StyleLook>>;
  readonly margins?: Partial<Margins>;
};

/** What a paragraph holds: plain text, or runs (and other inlines) as written. */
export type Writing = string | readonly Inline[];

/** A table's cell: its writing, or its writing with its own background and paragraph formatting. */
export type CellWriting =
  | Writing
  | {
      readonly writing: Writing;
      readonly background?: string;
      readonly paragraph?: ParagraphProps;
    };

export type TableOptions = {
  /** Each column's share of the line's width; equal shares when absent. */
  readonly shares?: readonly number[];
  /** How many leading rows are header rows. */
  readonly headerRows?: number;
};

const INCH = 72;

/** A run of text with its own formatting. */
export const run = (text: string, props: TextProps = {}): Run => ({ type: 'run', text, props });
/** A bold run. */
export const bold = (text: string, props: TextProps = {}): Run =>
  run(text, { ...props, bold: true });
/** An italic run. */
export const italic = (text: string, props: TextProps = {}): Run =>
  run(text, { ...props, italic: true });

const inlinesOf = (writing: Writing): readonly Inline[] =>
  typeof writing === 'string' ? (writing ? [run(writing)] : []) : writing;

/**
 * The writer of one template: paragraphs in its styles, lists (each call one list of its own), tables across the
 * line, and rules, collected in order, with the lists they use.
 */
export class TemplateWriter {
  readonly #styles = Styles.builtIn('odf');
  readonly #lists: Record<string, ListDefinition> = {};
  readonly #width: number;

  constructor(lineWidth: number) {
    this.#width = lineWidth;
  }

  /** The id of a built-in style. */
  styleId(role: StyleRole): string {
    return Styles.idOfRole(this.#styles, role)!;
  }

  /** A paragraph in a built-in style. */
  paragraph(role: StyleRole, writing: Writing, props: ParagraphProps = {}): Paragraph {
    return { type: 'paragraph', style: this.styleId(role), props, inlines: inlinesOf(writing) };
  }

  /** A normal text paragraph. */
  p(writing: Writing, props: ParagraphProps = {}): Paragraph {
    return this.paragraph('normal', writing, props);
  }

  title(writing: Writing, props: ParagraphProps = {}): Paragraph {
    return this.paragraph('title', writing, props);
  }

  subtitle(writing: Writing, props: ParagraphProps = {}): Paragraph {
    return this.paragraph('subtitle', writing, props);
  }

  h1(writing: Writing, props: ParagraphProps = {}): Paragraph {
    return this.paragraph('heading1', writing, props);
  }

  h2(writing: Writing, props: ParagraphProps = {}): Paragraph {
    return this.paragraph('heading2', writing, props);
  }

  h3(writing: Writing, props: ParagraphProps = {}): Paragraph {
    return this.paragraph('heading3', writing, props);
  }

  /** An empty paragraph drawn as a line across the column: its bottom border. */
  rule(color: string, width = 1, props: ParagraphProps = {}): Paragraph {
    return this.p('', {
      spaceAfter: 6,
      ...props,
      borders: { bottom: { width, dash: 'solid', color, space: 1 } },
    });
  }

  /** A list of one item a paragraph, in a preset's look ('bulleted', 'numbered', 'checklist-plain', ...). */
  list(
    preset: string,
    items: readonly Writing[],
    props: ParagraphProps = {},
    checked: readonly boolean[] = [],
  ): Paragraph[] {
    const look = ListPresets.byId(preset);
    if (!look) throw new Error(`no list preset ${preset}`);
    const id = `list-${Object.keys(this.#lists).length + 1}`;
    this.#lists[id] = look.list;
    return items.map((item, n) => ({
      ...this.p(item, props),
      list: { id, level: 0, ...(look.kind === 'check' ? { checked: checked[n] === true } : {}) },
    }));
  }

  bullets(items: readonly Writing[], props: ParagraphProps = {}): Paragraph[] {
    return this.list('bulleted', items, props);
  }

  numbered(items: readonly Writing[], props: ParagraphProps = {}): Paragraph[] {
    return this.list('numbered', items, props);
  }

  /** A checklist; `checked` ticks items by their place. */
  checklist(
    items: readonly Writing[],
    props: ParagraphProps = {},
    checked: readonly boolean[] = [],
  ): Paragraph[] {
    return this.list('checklist-plain', items, props, checked);
  }

  /** A table across the line, each cell one normal text paragraph. */
  table(
    rows: readonly (readonly CellWriting[])[],
    { shares, headerRows = 0 }: TableOptions = {},
  ): Table {
    const count = Math.max(...rows.map((row) => row.length));
    const parts = shares ?? Array.from({ length: count }, () => 1);
    const total = parts.reduce((a, b) => a + b, 0);
    const cell = (writing: CellWriting): TableCell => {
      const plain = typeof writing === 'string' || Array.isArray(writing);
      const own = plain
        ? { writing: writing as Writing }
        : (writing as Exclude<CellWriting, Writing>);
      return {
        blocks: [this.p(own.writing, own.paragraph)],
        props: own.background ? { background: own.background } : {},
      };
    };
    return {
      type: 'table',
      columns: parts.map((part) => (this.#width * part) / total),
      rows: rows.map((row) => ({ cells: row.map(cell) })),
      headerRows,
    };
  }

  /** The styles, each restyled as the look says. */
  styles(look: TemplateLook) {
    return this.#styles.map((style) => {
      const own = style.role ? look.styles?.[style.role] : undefined;
      return own
        ? {
            ...style,
            paragraph: { ...style.paragraph, ...own.paragraph },
            text: { ...style.text, ...own.text },
          }
        : style;
    });
  }

  /** The lists the writing used, by id. */
  lists(): Readonly<Record<string, ListDefinition>> {
    return { ...this.#lists };
  }
}

/**
 * A template's text document: a blank on Letter paper, born in ODF, with the look's normal text, styles and margins,
 * and the writing the body gives.
 */
export function templateDocument(
  look: TemplateLook,
  body: (write: TemplateWriter) => readonly Block[],
): TextDocument {
  const blank = TextDocument.blank({ format: 'odf', paper: 'letter' });
  const margins = { ...blank.section.setup.margins, ...look.margins };
  const writer = new TemplateWriter(blank.section.setup.width - margins.left - margins.right);
  const blocks = body(writer);
  const defaults = Styles.defaults();
  return {
    ...blank,
    defaults: {
      paragraph: { ...defaults.paragraph, ...look.paragraph },
      text: { ...defaults.text, ...look.text },
    },
    styles: writer.styles(look),
    lists: writer.lists(),
    section: { ...blank.section, setup: { ...blank.section.setup, margins } },
    body: blocks,
  };
}

/** An inch in points, for margins. */
export const TEMPLATE_INCH = INCH;
