// Paragraph and text styles (docs/specs/034-text-documents/text-and-paragraphs.md "Paragraph styles"): named sets of
// formatting, the built-in ones known by role in either format's names.
import { compact, type KeptProperties, type ParagraphProps, type TextProps } from './props';

export const STYLE_ROLES = [
  'normal',
  'title',
  'subtitle',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
] as const;
export type StyleRole = (typeof STYLE_ROLES)[number];

export type Style = {
  /** The file's id: ODF `style:name`, OOXML `w:styleId`. */
  readonly id: string;
  /** The name people see: ODF `style:display-name` (else the id), OOXML `w:name`. */
  readonly name: string;
  readonly family: 'paragraph' | 'text';
  readonly parent?: string;
  readonly next?: string;
  readonly role?: StyleRole;
  readonly paragraph: ParagraphProps;
  readonly text: TextProps;
  readonly kept?: KeptProperties;
};

/** Formatting every style inherits: ODF `style:default-style`, OOXML `w:docDefaults`. */
export type StyleDefaults = {
  readonly paragraph: ParagraphProps;
  readonly text: TextProps;
  readonly kept?: KeptProperties;
};

/** The built-in role a style's name stands for in either format, if any. */
export function roleOfStyleName(name: string): StyleRole | undefined {
  const plain = name.replace(/_20_/g, ' ').trim().toLowerCase();
  if (plain === 'normal' || plain === 'standard' || plain === 'default paragraph style')
    return 'normal';
  if (plain === 'title') return 'title';
  if (plain === 'subtitle') return 'subtitle';
  const heading = plain.match(/^heading ?([1-6])$/);
  return heading ? (`heading${heading[1]}` as StyleRole) : undefined;
}

/** The style ids a role has in each format's own files. */
export const ROLE_IDS: Record<'odf' | 'ooxml', Record<StyleRole, string>> = {
  odf: {
    normal: 'Standard',
    title: 'Title',
    subtitle: 'Subtitle',
    heading1: 'Heading_20_1',
    heading2: 'Heading_20_2',
    heading3: 'Heading_20_3',
    heading4: 'Heading_20_4',
    heading5: 'Heading_20_5',
    heading6: 'Heading_20_6',
  },
  ooxml: {
    normal: 'Normal',
    title: 'Title',
    subtitle: 'Subtitle',
    heading1: 'Heading1',
    heading2: 'Heading2',
    heading3: 'Heading3',
    heading4: 'Heading4',
    heading5: 'Heading5',
    heading6: 'Heading6',
  },
};

const ROLE_NAMES: Record<StyleRole, string> = {
  normal: 'Normal text',
  title: 'Title',
  subtitle: 'Subtitle',
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  heading4: 'Heading 4',
  heading5: 'Heading 5',
  heading6: 'Heading 6',
};

const ROLE_NAMES_OOXML: Record<StyleRole, string> = {
  normal: 'Normal',
  title: 'Title',
  subtitle: 'Subtitle',
  heading1: 'heading 1',
  heading2: 'heading 2',
  heading3: 'heading 3',
  heading4: 'heading 4',
  heading5: 'heading 5',
  heading6: 'heading 6',
};

const GREY = '#666666';

// A new text document's styles: Google's defaults (text-and-paragraphs.md "Paragraph styles", assumed until the
// captures confirm them). Headings keep with the next paragraph (page-layout.md).
const ROLE_FORMATTING: Record<StyleRole, { paragraph: ParagraphProps; text: TextProps }> = {
  normal: { paragraph: {}, text: {} },
  title: { paragraph: { spaceAfter: 3, keepWithNext: true }, text: { size: 26 } },
  subtitle: { paragraph: { spaceAfter: 16, keepWithNext: true }, text: { size: 15, color: GREY } },
  heading1: {
    paragraph: { spaceBefore: 20, spaceAfter: 6, keepWithNext: true, outlineLevel: 1 },
    text: { size: 20 },
  },
  heading2: {
    paragraph: { spaceBefore: 18, spaceAfter: 6, keepWithNext: true, outlineLevel: 2 },
    text: { size: 16 },
  },
  heading3: {
    paragraph: { spaceBefore: 16, spaceAfter: 4, keepWithNext: true, outlineLevel: 3 },
    text: { size: 14, color: '#434343' },
  },
  heading4: {
    paragraph: { spaceBefore: 14, spaceAfter: 4, keepWithNext: true, outlineLevel: 4 },
    text: { size: 12, color: GREY },
  },
  heading5: {
    paragraph: { spaceBefore: 12, spaceAfter: 4, keepWithNext: true, outlineLevel: 5 },
    text: { size: 11, color: GREY },
  },
  heading6: {
    paragraph: { spaceBefore: 12, spaceAfter: 4, keepWithNext: true, outlineLevel: 6 },
    text: { size: 11, color: GREY, italic: true },
  },
};

export const Styles = {
  /** The built-in styles of a new text document, in the format's own ids. */
  builtIn: (format: 'odf' | 'ooxml'): Style[] =>
    STYLE_ROLES.map((role) => ({
      id: ROLE_IDS[format][role],
      // Word knows its built-in styles by their own names ("heading 1"); ODF suites by the display name.
      name: format === 'ooxml' ? ROLE_NAMES_OOXML[role] : ROLE_NAMES[role],
      family: 'paragraph',
      ...(role === 'normal'
        ? {}
        : { parent: ROLE_IDS[format].normal, next: ROLE_IDS[format].normal }),
      role,
      ...ROLE_FORMATTING[role],
    })),
  /** A new text document's defaults: Arial 11 pt, line spacing 1.15, single lines prevented. */
  defaults: (): StyleDefaults => ({
    paragraph: {
      lineHeight: { rule: 'multiple', value: 1.15 },
      widowControl: true,
      tabInterval: 36,
    },
    text: { font: 'Arial', size: 11 },
  }),
  byId: (styles: readonly Style[], id: string | undefined): Style | undefined =>
    id === undefined ? undefined : styles.find((s) => s.id === id),
  /** The id of the style with this role, if the document has one. */
  idOfRole: (styles: readonly Style[], role: StyleRole): string | undefined =>
    styles.find((s) => s.role === role)?.id,
  /**
   * The text formatting a character gets from its styles: the defaults, then its paragraph style through its parents,
   * then its text style through its parents, each nearer one overriding (a `false` too).
   */
  textPropsOf: (
    styles: readonly Style[],
    defaults: StyleDefaults,
    paragraphStyle: string | undefined,
    textStyle?: string,
  ): TextProps => {
    const chain = (id: string | undefined): TextProps[] => {
      const seen = new Set<string>();
      const out: TextProps[] = [];
      let style = Styles.byId(styles, id);
      while (style && !seen.has(style.id)) {
        out.unshift(compact(style.text));
        seen.add(style.id);
        style = Styles.byId(styles, style.parent);
      }
      return out;
    };
    return Object.assign(
      {},
      compact(defaults.text),
      ...chain(paragraphStyle),
      ...chain(textStyle),
    ) as TextProps;
  },
  /**
   * The paragraph formatting a paragraph gets from its style: the defaults, then its style through its parents, each
   * nearer one overriding (text-and-paragraphs.md "Paragraph styles").
   */
  paragraphPropsOf: (
    styles: readonly Style[],
    defaults: StyleDefaults,
    paragraphStyle: string | undefined,
  ): ParagraphProps => {
    const seen = new Set<string>();
    const chain: ParagraphProps[] = [];
    let style = Styles.byId(styles, paragraphStyle);
    while (style && !seen.has(style.id)) {
      chain.unshift(compact(style.paragraph));
      seen.add(style.id);
      style = Styles.byId(styles, style.parent);
    }
    return Object.assign({}, compact(defaults.paragraph), ...chain) as ParagraphProps;
  },
  /** The outline level a paragraph style gives, through its parents. */
  outlineLevel: (styles: readonly Style[], id: string | undefined): number | undefined => {
    const seen = new Set<string>();
    let style = Styles.byId(styles, id);
    while (style && !seen.has(style.id)) {
      if (style.paragraph.outlineLevel !== undefined) return style.paragraph.outlineLevel;
      seen.add(style.id);
      style = Styles.byId(styles, style.parent);
    }
    return undefined;
  },
} as const;
