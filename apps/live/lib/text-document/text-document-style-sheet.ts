// A text document's paragraph styles as one style sheet (docs/specs/034-text-documents/text-and-paragraphs.md
// "Paragraph styles"): each paragraph style's text and paragraph formatting, through its parents and the defaults, on
// the paragraphs that name it; Normal text on those that name none or one the document lacks. A run's own formatting
// is a span inside its paragraph, so it draws over its style.
import { DocumentFonts } from '@livedoc/document';
import {
  Styles,
  type ParagraphProps,
  type Style,
  type StyleDefaults,
  type TextProps,
} from '@livedoc/text-documents';

const BODY = '.text-document-body';
const HEX = /^#[0-9a-f]{6}$/i;
const pt = (value: number | undefined, max = 1584) =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max
    ? `${value}pt`
    : undefined;

function textDeclarations(t: TextProps): (string | undefined)[] {
  const lines = [t.underline ? 'underline' : '', t.strike ? 'line-through' : ''].filter(Boolean);
  return [
    t.font ? `font-family: ${DocumentFonts.stack(t.font)}` : undefined,
    t.size !== undefined && t.size > 0 && t.size < 1000 ? `font-size: ${t.size}pt` : undefined,
    t.bold === undefined ? undefined : `font-weight: ${t.bold ? 700 : 400}`,
    t.italic === undefined ? undefined : `font-style: ${t.italic ? 'italic' : 'normal'}`,
    lines.length > 0 ? `text-decoration-line: ${lines.join(' ')}` : undefined,
    t.color && HEX.test(t.color) ? `color: ${t.color}` : undefined,
    t.highlight && HEX.test(t.highlight) ? `background-color: ${t.highlight}` : undefined,
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
    pt(p.indentStart) && `padding-inline-start: ${pt(p.indentStart)}`,
    pt(p.indentEnd) && `padding-inline-end: ${pt(p.indentEnd)}`,
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
  const rules = [`${scope} p { ${styleRule(styles, defaults, normal)} }`];
  for (const style of styles)
    if (style.family === 'paragraph')
      rules.push(
        `${scope} p[data-style=${quoted(style.id)}] { ${styleRule(styles, defaults, style.id)} }`,
      );
  return rules.join('\n');
}
