// A Web Page's and an EPUB's stylesheet, and the declarations direct formatting writes on an element
// (docs/specs/034-text-documents/files-and-print.md "Downloading"). Every value comes from a file, so each is checked
// before it is written: a colour as `#rrggbb`, a font name of plain characters, a length a finite number.
import type { ParagraphProps, TextProps } from '../model/props';
import { Styles, type StyleRole } from '../model/styles';
import type { TextDocument } from '../model/text-document';

const HEX = /^#[0-9a-f]{6}$/i;
/** Characters a font name keeps; anything else (quotes, semicolons, angle brackets) is dropped. */
const FONT_UNSAFE = /[^\p{L}\p{N} _-]/gu;

const pt = (n: number | undefined) =>
  n !== undefined && Number.isFinite(n) ? `${Math.round(n * 100) / 100}pt` : undefined;
const colour = (c: string | undefined) => (c && HEX.test(c) ? c.toLowerCase() : undefined);
const fontName = (f: string | undefined) => {
  const kept = f?.replace(FONT_UNSAFE, '').trim();
  return kept ? `'${kept}'` : undefined;
};

const CASES = new Set(['uppercase', 'lowercase', 'capitalize', 'none']);
const ALIGN = { start: 'left', center: 'center', end: 'right', justify: 'justify' } as const;

/** Declarations as `name: value` pairs, those without a value left out. */
const declared = (pairs: readonly [string, string | undefined][]): string[] =>
  pairs.flatMap(([name, value]) => (value === undefined ? [] : [`${name}: ${value}`]));

/** A run's formatting the semantic tags do not say: colour, highlight, font, size, small caps, case. */
export function textDeclarations(props: TextProps): string[] {
  return declared([
    ['color', colour(props.color)],
    ['background-color', colour(props.highlight)],
    ['font-family', fontName(props.font)],
    ['font-size', pt(props.size)],
    ['font-variant', props.smallCaps === true ? 'small-caps' : undefined],
    ['text-transform', props.transform && CASES.has(props.transform) ? props.transform : undefined],
  ]);
}

/** A paragraph's formatting as CSS: alignment, indents, the first line, spacing, a page break before. */
export function paragraphDeclarations(props: ParagraphProps): string[] {
  return declared([
    ['text-align', props.align ? ALIGN[props.align] : undefined],
    ['margin-left', pt(props.indentStart)],
    ['margin-right', pt(props.indentEnd)],
    ['text-indent', pt(props.indentFirst)],
    ['margin-top', pt(props.spaceBefore)],
    ['margin-bottom', pt(props.spaceAfter)],
    ['break-before', props.pageBreakBefore === true ? 'page' : undefined],
  ]);
}

/** The selector each built-in style is written under. */
const SELECTORS: Readonly<Record<StyleRole, string>> = {
  normal: 'body',
  title: 'p.title',
  subtitle: 'p.subtitle',
  heading1: 'h1',
  heading2: 'h2',
  heading3: 'h3',
  heading4: 'h4',
  heading5: 'h5',
  heading6: 'h6',
};

/** What the page draws the same whatever the document: tabs, code, tables, checklists, cropped pictures. */
const FIXED_RULES = [
  '.tab { white-space: pre; }',
  'pre { white-space: pre-wrap; }',
  'table { border-collapse: collapse; }',
  'td, th { border: 1px solid #888888; padding: 4px; vertical-align: top; }',
  'li.check { list-style: none; }',
  '.crop { display: inline-block; overflow: hidden; vertical-align: bottom; }',
  '.footnotes { border-top: 1px solid #888888; margin-top: 2em; }',
];

/** One rule a built-in style the document has, then the fixed rules. */
export function exportStylesheet(document: TextDocument): string {
  const rules = (Object.keys(SELECTORS) as StyleRole[]).flatMap((role) => {
    const id = Styles.idOfRole(document.styles, role);
    if (id === undefined && role !== 'normal') return [];
    const text = Styles.textPropsOf(document.styles, document.defaults, id);
    const paragraph = Styles.paragraphPropsOf(document.styles, document.defaults, id);
    const lineHeight =
      role === 'normal' && paragraph.lineHeight?.rule === 'multiple'
        ? String(paragraph.lineHeight.value)
        : undefined;
    const body = [
      ...textDeclarations(text),
      ...declared([
        ['font-weight', text.bold === undefined ? undefined : text.bold ? '700' : '400'],
        ['font-style', text.italic === undefined ? undefined : text.italic ? 'italic' : 'normal'],
        ['line-height', lineHeight],
      ]),
      ...(role === 'normal' ? [] : paragraphDeclarations(paragraph)),
    ];
    return body.length > 0 ? [`${SELECTORS[role]} { ${body.join('; ')}; }`] : [];
  });
  return [...rules, ...FIXED_RULES].join('\n');
}
