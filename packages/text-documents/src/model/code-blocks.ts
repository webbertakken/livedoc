// Code blocks (docs/specs/034-text-documents/objects.md "Code blocks"): one paragraph in a code style, its lines split
// by line breaks. `Code` is a block of no language; `Code (<Language>)` names one of Google's list. Each language's
// style is based on `Code` and carries the code formatting itself, so a suite that drops the parent still draws it.
import type { BorderLine, ParagraphProps, TextProps } from './props';
import type { Style } from './styles';

/** Google's languages in its order (default, until Google's own files are read); the id is LiveDoc's. */
export const CODE_BLOCK_LANGUAGES = [
  { id: 'c', label: 'C/C++' },
  { id: 'csharp', label: 'CSharp' },
  { id: 'css', label: 'CSS' },
  { id: 'go', label: 'Go' },
  { id: 'html', label: 'HTML' },
  { id: 'java', label: 'Java' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'json', label: 'JSON' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'php', label: 'PHP' },
  { id: 'protobuf', label: 'Protobuf' },
  { id: 'python', label: 'Python' },
  { id: 'rust', label: 'Rust' },
  { id: 'shell', label: 'Shell' },
  { id: 'sql', label: 'SQL' },
  { id: 'textproto', label: 'Textproto' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'xml', label: 'XML' },
] as const;

export type CodeBlockLanguage = (typeof CODE_BLOCK_LANGUAGES)[number]['id'];

/** The style every code block is, or is based on. */
export const CODE_STYLE_NAME = 'Code';
/** Google's code font (default). */
export const CODE_BLOCK_FONT = 'Roboto Mono';
/** Points (default). */
export const CODE_BLOCK_SIZE = 10;
/** Google's code block grey (default). */
export const CODE_BLOCK_SHADING = '#f1f3f4';
/** Points before and after a block (default). */
export const CODE_BLOCK_SPACE = 6;
/** Points between the text and the block's edge, as a line of the block's own grey (default). */
export const CODE_BLOCK_PADDING = 4;

const EDGE: BorderLine = {
  width: 1,
  dash: 'solid',
  color: CODE_BLOCK_SHADING,
  space: CODE_BLOCK_PADDING,
};

const CODE_PARAGRAPH: ParagraphProps = {
  spaceBefore: CODE_BLOCK_SPACE,
  spaceAfter: CODE_BLOCK_SPACE,
  lineHeight: { rule: 'multiple', value: 1 },
  shading: CODE_BLOCK_SHADING,
  borders: { top: EDGE, bottom: EDGE, left: EDGE, right: EDGE },
};
const CODE_TEXT: TextProps = { font: CODE_BLOCK_FONT, size: CODE_BLOCK_SIZE };

const LABELS = new Map<string, CodeBlockLanguage>(CODE_BLOCK_LANGUAGES.map((l) => [l.label, l.id]));
const labelOf = (language: CodeBlockLanguage): string =>
  CODE_BLOCK_LANGUAGES.find((l) => l.id === language)!.label;

const NAMED = /^Code \((.+)\)$/;

/** An ODF style name for a display name, each character outside letters and digits as `_<hex>_`, as LibreOffice writes. */
export const odfStyleName = (name: string): string =>
  [...name]
    .map((ch) => (/[A-Za-z0-9]/.test(ch) ? ch : `_${ch.codePointAt(0)!.toString(16)}_`))
    .join('');

const pascal = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

export const CodeBlocks = {
  /** The style name of a block in `language`, or of no language. */
  styleName: (language: CodeBlockLanguage | null): string =>
    language ? `${CODE_STYLE_NAME} (${labelOf(language)})` : CODE_STYLE_NAME,
  /** A style name's language: null for a block of no language (or one not on the list), undefined for no code. */
  languageOfName: (name: string): CodeBlockLanguage | null | undefined => {
    if (name === CODE_STYLE_NAME) return null;
    const match = NAMED.exec(name);
    return match ? (LABELS.get(match[1]!) ?? null) : undefined;
  },
  /** The code block a paragraph of style `id` is, if any. */
  of: (
    styles: readonly Style[],
    id: string | null | undefined,
  ): { language: CodeBlockLanguage | null } | undefined => {
    if (!id) return undefined;
    const style = styles.find((s) => s.id === id && s.family === 'paragraph');
    const language = style ? CodeBlocks.languageOfName(style.name) : undefined;
    return language === undefined ? undefined : { language };
  },
  /** The document's own style for a block in `language`, if it has one. */
  held: (styles: readonly Style[], language: CodeBlockLanguage | null): Style | undefined => {
    const name = CodeBlocks.styleName(language);
    return styles.find((s) => s.family === 'paragraph' && s.name === name);
  },
  /**
   * A new style for a block in `language`, its id free among `styles`, in the format's own spelling; a language's
   * is based on the document's `Code`.
   */
  style: (
    format: 'odf' | 'ooxml',
    language: CodeBlockLanguage | null,
    styles: readonly Style[],
  ): Style => {
    const name = CodeBlocks.styleName(language);
    const wanted =
      format === 'odf'
        ? odfStyleName(name)
        : `${CODE_STYLE_NAME}${language ? pascal(language) : ''}`;
    const taken = new Set(styles.map((s) => s.id));
    let id = wanted;
    for (let n = 2; taken.has(id); n++) id = `${wanted}${n}`;
    return {
      id,
      name,
      family: 'paragraph',
      ...(language ? { parent: CodeBlocks.held(styles, null)?.id ?? CODE_STYLE_NAME } : {}),
      paragraph: CODE_PARAGRAPH,
      text: CODE_TEXT,
    };
  },
} as const;
