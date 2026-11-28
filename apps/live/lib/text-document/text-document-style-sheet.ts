// A text document's paragraph styles as one style sheet (docs/specs/034-text-documents/text-and-paragraphs.md
// "Paragraph styles"): each paragraph style's text and paragraph formatting, through its parents and the defaults, on
// the paragraphs that name it; Normal text on those that name none or one the document lacks. A run's own formatting
// is a span inside its paragraph, so it draws over its style.
import { DocumentFonts } from '@livedoc/document';
import {
  Styles,
  type BorderDash,
  type BorderLine,
  type ParagraphProps,
  type Style,
  type StyleDefaults,
  type TextProps,
  paperFill,
  paperInk,
} from '@livedoc/text-documents';

const BODY = '.text-document-body';
const HEX = /^#[0-9a-f]{6}$/i;
/** A length in points as CSS, or none when it is not a sane one. */
export const pt = (value: number | undefined, max = 1584) =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max
    ? `${value}pt`
    : undefined;

/** How colours are drawn: for the page's paper on screen, or as they are, on white paper (the clipboard). */
export type PaperColours = { ink: (colour: string) => string; fill: (colour: string) => string };
const SCREEN_PAPER: PaperColours = { ink: paperInk, fill: paperFill };
export const WHITE_PAPER: PaperColours = { ink: (c) => c, fill: (c) => c };

/** A run's or a style's text formatting as CSS declarations, each value checked. */
export function textDeclarations(t: TextProps, paper = SCREEN_PAPER): (string | undefined)[] {
  const lines = [t.underline ? 'underline' : '', t.strike ? 'line-through' : ''].filter(Boolean);
  return [
    t.font ? `font-family: ${DocumentFonts.stack(t.font)}` : undefined,
    t.size !== undefined && t.size > 0 && t.size < 1000 ? `font-size: ${t.size}pt` : undefined,
    t.bold === undefined ? undefined : `font-weight: ${t.bold ? 700 : 400}`,
    t.italic === undefined ? undefined : `font-style: ${t.italic ? 'italic' : 'normal'}`,
    lines.length > 0 ? `text-decoration-line: ${lines.join(' ')}` : undefined,
    // Drawn for the page's paper (editing-surface.md "The page in the dark scheme").
    t.color && HEX.test(t.color) ? `color: ${paper.ink(t.color)}` : undefined,
    t.highlight && HEX.test(t.highlight)
      ? `background-color: ${paper.fill(t.highlight)}`
      : undefined,
    t.smallCaps ? 'font-variant: small-caps' : undefined,
    t.transform && t.transform !== 'none' ? `text-transform: ${t.transform}` : undefined,
  ];
}

const ALIGN: Record<NonNullable<ParagraphProps['align']>, string> = {
  start: 'start',
  center: 'center',
  end: 'end',
  justify: 'justify',
};

/** A paragraph's formatting as CSS declarations, each value checked (an unknown one draws nothing). */
export function paragraphDeclarations(p: ParagraphProps): (string | undefined)[] {
  const height = p.lineHeight;
  return [
    p.align && Object.hasOwn(ALIGN, p.align) ? `text-align: ${ALIGN[p.align]}` : undefined,
    // Indents as variables the paragraph rule draws: as padding, or as margin around a box (boxDeclarations).
    pt(p.indentStart) && `${INDENT_START}: ${pt(p.indentStart)}`,
    pt(p.indentEnd) && `${INDENT_END}: ${pt(p.indentEnd)}`,
    pt(p.indentFirst) && `text-indent: ${pt(p.indentFirst)}`,
    pt(p.spaceBefore) && `margin-top: ${pt(p.spaceBefore)}`,
    pt(p.spaceAfter) && `margin-bottom: ${pt(p.spaceAfter)}`,
    height === undefined
      ? undefined
      : height.rule === 'multiple'
        ? Number.isFinite(height.value) && height.value > 0 && height.value < 100
          ? `line-height: ${height.value}`
          : undefined
        : pt(height.pt) && `line-height: ${pt(height.pt)}`,
    // The keep rules, as the print layout's break rules (text-and-paragraphs.md "Spacing and keep rules").
    typeof p.keepWithNext === 'boolean'
      ? `break-after: ${p.keepWithNext ? 'avoid' : 'auto'}`
      : undefined,
    typeof p.keepTogether === 'boolean'
      ? `break-inside: ${p.keepTogether ? 'avoid' : 'auto'}`
      : undefined,
    typeof p.widowControl === 'boolean' ? `widows: ${p.widowControl ? 2 : 1}` : undefined,
    typeof p.widowControl === 'boolean' ? `orphans: ${p.widowControl ? 2 : 1}` : undefined,
    ...boxDeclarations(p),
  ];
}

export const INDENT_START = '--text-document-indent-start';
export const INDENT_END = '--text-document-indent-end';
const DASH: Record<BorderDash, string> = { solid: 'solid', dotted: 'dotted', dashed: 'dashed' };

/** One border line as CSS (`1pt solid #000000`), or none for a line that draws nothing. */
export function borderCss(line: BorderLine | undefined, ink = paperInk): string {
  if (!line || !pt(line.width, 12) || !Object.hasOwn(DASH, line.dash) || !HEX.test(line.color))
    return 'none';
  return `${pt(line.width, 12)} ${DASH[line.dash]} ${ink(line.color)}`;
}

const SIDES = ['top', 'bottom', 'left', 'right'] as const;

/**
 * A paragraph with borders or a background is a box (text-and-paragraphs.md "Borders and shading"): it stands at its
 * indents (as margin), its borders around it, each side's padding inside.
 */
export function boxDeclarations(p: ParagraphProps): string[] {
  const shading = p.shading && HEX.test(p.shading) ? p.shading : undefined;
  if (!p.borders && !shading) return [];
  const borders = p.borders ?? {};
  return [
    `margin-inline-start: var(${INDENT_START}, 0)`,
    `margin-inline-end: var(${INDENT_END}, 0)`,
    // What its margins take from a section's own width (page-layout.md "Each page is drawn at its section's setup").
    `--text-document-box-inline: calc(var(${INDENT_START}, 0pt) + var(${INDENT_END}, 0pt))`,
    ...SIDES.flatMap((side) => {
      const line = borders[side];
      // A line of the box's own fill is drawn as that fill, so it melts into the box on either paper.
      const fill = shading !== undefined && line?.color.toLowerCase() === shading.toLowerCase();
      const drawn = borderCss(line, fill ? paperFill : paperInk);
      return [
        `border-${side}: ${drawn}`,
        `padding-${side}: ${drawn !== 'none' ? (pt(line!.space, 72) ?? '0pt') : '0pt'}`,
      ];
    }),
    `background-color: ${shading ? paperFill(shading) : 'transparent'}`,
  ];
}

/** Declarations as one CSS text, the empty ones dropped. */
export const cssText = (declarations: readonly (string | undefined)[]): string =>
  declarations
    .filter((d): d is string => typeof d === 'string' && d !== '')
    .map((d) => `${d};`)
    .join(' ');

/** One paragraph style's declarations, through its parents and the defaults. */
export function styleRule(
  styles: readonly Style[],
  defaults: StyleDefaults,
  id: string | undefined,
): string {
  return cssText([
    ...textDeclarations(Styles.textPropsOf(styles, defaults, id)),
    ...paragraphDeclarations(Styles.paragraphPropsOf(styles, defaults, id)),
  ]);
}

const quoted = (id: string) =>
  `"${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ')}"`;

/** The sheet, its rules under `scope`: one document's body, so two documents side by side keep their own. */
export function textDocumentStyleSheet(
  styles: readonly Style[],
  defaults: StyleDefaults,
  scope = BODY,
): string {
  const normal = Styles.idOfRole(styles, 'normal');
  // Indents draw as padding, unless a box draws them as its margin.
  const indents = `padding-inline-start: var(${INDENT_START}, 0); padding-inline-end: var(${INDENT_END}, 0);`;
  const rules = [`${scope} p { ${indents} ${styleRule(styles, defaults, normal)} }`];
  for (const style of styles)
    if (style.family === 'paragraph')
      rules.push(
        `${scope} p[data-style=${quoted(style.id)}] { ${styleRule(styles, defaults, style.id)} }`,
      );
  return rules.join('\n');
}
