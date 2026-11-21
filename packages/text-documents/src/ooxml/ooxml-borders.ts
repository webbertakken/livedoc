// Paragraph borders and shading in WordprocessingML (standard-mapping.md "The model"): `w:pBdr` (widths in eighths of
// a point, padding in whole points up to 31, `nil` where a side has none) and `w:shd`'s fill. A line style the model
// has no dash for reads as solid.
import {
  attributeOf,
  childElement,
  colourToOoxml,
  escapeXmlAttribute,
  ooxmlColour,
  round3,
  type XmlElement,
} from '@livedoc/office-packages';
import {
  BORDER_SIDES,
  type BorderDash,
  type BorderLine,
  type ParagraphBorders,
} from '../model/props';
import { W_NS } from './ooxml-names';

/** Word's narrowest and widest border (`w:sz` 2 to 96 eighths) and its most padding (`w:space`, points). */
export const OOXML_BORDER_MIN_PT = 0.25;
export const OOXML_BORDER_MAX_PT = 12;
export const OOXML_BORDER_SPACE_MAX_PT = 31;

// `w:pBdr`'s children in the schema's order.
const PBDR_ORDER = ['top', 'left', 'bottom', 'right', 'between'] as const;

const w = (e: XmlElement, local: string) => attributeOf(e, W_NS, local);

function dashOf(value: string | undefined): BorderDash | null {
  if (value === undefined || value === 'nil' || value === 'none') return null;
  if (value === 'dotted') return 'dotted';
  return /dash/i.test(value) ? 'dashed' : 'solid';
}

/** One border element (`w:top`, `w:insideH`, ...) as a line; undefined for none (`nil`, `none`) or no element. */
export function lineOf(e: XmlElement | undefined): BorderLine | undefined {
  if (!e) return undefined;
  const dash = dashOf(w(e, 'val'));
  if (dash === null) return undefined;
  const size = Number(w(e, 'sz'));
  const space = Number(w(e, 'space'));
  return {
    width: round3(Number.isFinite(size) && size > 0 ? size / 8 : OOXML_BORDER_MIN_PT),
    dash,
    color: ooxmlColour(w(e, 'color')) ?? '#000000',
    space: Number.isFinite(space) && space > 0 ? space : 0,
  };
}

/** The borders of a `w:pPr`'s `w:pBdr`; undefined when it has none. */
export function readBorders(pPr: XmlElement): ParagraphBorders | undefined {
  const pBdr = childElement(pPr, W_NS, 'pBdr');
  if (!pBdr) return undefined;
  const borders: Record<string, BorderLine> = {};
  for (const side of BORDER_SIDES) {
    const line = lineOf(childElement(pBdr, W_NS, side));
    if (line) borders[side] = line;
  }
  return borders;
}

export const OOXML_DASH: Record<BorderDash, string> = {
  solid: 'single',
  dotted: 'dotted',
  dashed: 'dashed',
};

/** A border's `w:sz`: eighths of a point, held to what Word draws. */
export const borderSize = (width: number): number =>
  Math.round(Math.min(OOXML_BORDER_MAX_PT, Math.max(OOXML_BORDER_MIN_PT, width)) * 8);

/** A border's `w:space`: whole points, held to Word's most. */
export const borderSpace = (space: number): number =>
  Math.min(OOXML_BORDER_SPACE_MAX_PT, Math.max(0, Math.round(space)));

/** `w:pBdr` for these borders, every side written (`nil` where absent) so they replace the style's whole. */
export function bordersXml(borders: ParagraphBorders | undefined): string | undefined {
  if (!borders) return undefined;
  const sides = PBDR_ORDER.map((side) => {
    const line = borders[side];
    if (!line) return `<w:${side} w:val="nil"/>`;
    const attrs = {
      'w:val': OOXML_DASH[line.dash],
      'w:sz': String(borderSize(line.width)),
      'w:space': String(borderSpace(line.space)),
      'w:color': colourToOoxml(line.color),
    };
    return `<w:${side}${Object.entries(attrs)
      .map(([k, v]) => ` ${k}="${escapeXmlAttribute(v)}"`)
      .join('')}/>`;
  });
  return `<w:pBdr>${sides.join('')}</w:pBdr>`;
}

/** A `w:pPr`'s background colour: `w:shd`'s fill, or its colour where the pattern is solid. */
export function readShading(pPr: XmlElement): string | undefined {
  const shd = childElement(pPr, W_NS, 'shd');
  if (!shd) return undefined;
  return w(shd, 'val') === 'solid' ? ooxmlColour(w(shd, 'color')) : ooxmlColour(w(shd, 'fill'));
}

export const shadingXml = (shading: string | undefined): string | undefined =>
  shading === undefined
    ? undefined
    : `<w:shd w:val="clear" w:color="auto" w:fill="${colourToOoxml(shading)}"/>`;
