import { PRISM_PALETTES, PRISM_STOPS, type PrismScheme, type PrismStop } from './brand-prism';

// The Page Stack's geometry (docs/specs/004-interface-design/brand-mark.md), shared by the React <BrandMark> and by
// the SVG strings the static copies are drawn from (favicons, marketing/media/logo/, the Apple icon, the social
// cards, the email mark). Every number here is listed in docs/specs/004-interface-design/brand-mark.md.

// cos 30°: the isometric plane's horizontal scale.
export const ISO_COS = Math.cos(Math.PI / 6);

// Every sheet is one size, in its plane's units; only the page is dog-eared.
export const SHEET = { width: 140, height: 150, fold: 44 } as const;

// Each sheet sits one step behind the next: along the plane, and a little higher than the plane's slope alone, so
// the stack climbs to the right.
export const STACK_STEP = { along: 40, rise: 12 } as const;

// A square around the closed stack (x 0..190.5, y -64..220), with a 4% margin.
export const BRAND_MARK_VIEWBOX = '-52.4 -69.7 295.4 295.4';

// `compact` below 48px; `full` adds the detail that only reads from 48px up.
export type BrandMarkVariant = 'compact' | 'full';
export type BrandMarkTone = 'colour' | 'mono';

export type BrandGradientKey = 'sheet' | 'plain' | 'page' | 'fold';

export type BrandGradient = {
  key: BrandGradientKey;
  // Gradient vector, in percent of the shape's bounding box.
  vector: { x1: number; y1: number; x2: number; y2: number };
  // [palette stop, offset %, stop opacity]
  stops: readonly (readonly [PrismStop, number, number])[];
};

// Brightest in front, deepest at the back; the fold is lit like a lid.
export const BRAND_GRADIENTS: readonly BrandGradient[] = [
  {
    key: 'sheet',
    vector: { x1: 0, y1: 0, x2: 100, y2: 100 },
    stops: [
      ['primary', 0, 0.7],
      ['dark', 100, 0.85],
    ],
  },
  {
    key: 'plain',
    vector: { x1: 0, y1: 0, x2: 100, y2: 100 },
    stops: [
      ['vivid', 0, 0.55],
      ['primary', 100, 0.85],
    ],
  },
  {
    key: 'page',
    vector: { x1: 0, y1: 0, x2: 100, y2: 100 },
    stops: [
      ['light', 0, 0.9],
      ['vivid', 50, 0.85],
      ['primary', 100, 0.95],
    ],
  },
  {
    key: 'fold',
    vector: { x1: 0, y1: 100, x2: 100, y2: 0 },
    stops: [
      ['light', 0, 0.75],
      ['highlight', 100, 0.85],
    ],
  },
];

export type BrandSheetKey = 'sheet' | 'plain' | 'page';

export type BrandSheet = {
  key: BrandSheetKey;
  // Steps behind the page: the page is 0.
  step: number;
  gradient: BrandGradientKey;
  // The sheet's opacity in the one-colour `mono` tone.
  monoOpacity: number;
};

// Back to front: the sheet (grid cells), the plain sheet, the page.
export const BRAND_SHEETS: readonly BrandSheet[] = [
  { key: 'sheet', step: 2, gradient: 'sheet', monoOpacity: 0.45 },
  { key: 'plain', step: 1, gradient: 'plain', monoOpacity: 0.65 },
  { key: 'page', step: 0, gradient: 'page', monoOpacity: 0.9 },
];

// Outlines in the sheet's plane. The back sheets are plain rectangles; the page has its corner folded.
const { width: W, height: H, fold: F } = SHEET;
export const SHEET_OUTLINE = `M0 0H${W}V${H}H0Z`;
export const PAGE_OUTLINE = `M0 0H${W - F}L${W} ${F}V${H}H0Z`;
export const PAGE_FOLD = `M${W - F} 0L${W - F} ${F}L${W} ${F}Z`;
// A back sheet's top and right edges, in highlight, so it holds its outline against the sheet in front.
export const SHEET_EDGE = `M0 0H${W}V${H}`;

export type BrandLine = { v: number; to: number; width: number };

// The detail per drawing (docs/specs/004-interface-design/brand-mark.md "Two drawings"). Text lines start 22 units
// in; `compact` carries two bold ones, whole pixels at 28px, `full` a heading and three finer lines, the grid cells
// on the back sheet's exposed strip, and a glass sheen along the page's edges.
export const BRAND_DETAIL = {
  lineStart: 22,
  compact: {
    lines: [
      { v: 72, to: 96, width: 19 },
      { v: 108, to: 112, width: 19 },
    ] as readonly BrandLine[],
    lineOpacity: 0.95,
    edge: { width: 5, opacity: 0.6 },
  },
  full: {
    lines: [
      { v: 66, to: 80, width: 12 },
      { v: 92, to: 116, width: 7 },
      { v: 110, to: 106, width: 7 },
      { v: 128, to: 82, width: 7 },
    ] as readonly BrandLine[],
    lineOpacity: 0.85,
    edge: { width: 2, opacity: 0.4 },
    cells: [16, 42, 68].map((y) => ({ x: W - 34, y, size: 20, radius: 2 })),
    cellOpacity: 0.5,
    sheen: [
      { d: `M${W - F} 0L${W - F} ${F}L${W} ${F}`, width: 2 },
      { d: `M0 ${H}V0H${W - F}`, width: 2.5 },
      { d: `M0 ${H}H${W}V${F}`, width: 3 },
    ],
  },
} as const;

// Where a sheet sits, in viewBox units. `fan` (0 closed .. 1 open) spreads the stack about the plain sheet: each
// sheet moves one more step from its neighbour, the page toward the viewer and the sheet away, so the stack opens
// without drifting (docs/specs/004-interface-design/brand-mark.md "Size and motion").
export function sheetOffset(step: number, fan = 0): { x: number; y: number } {
  const position = step + fan * (step - 1);
  const x = position * STACK_STEP.along * ISO_COS;
  const y = -position * (STACK_STEP.along / 2 + STACK_STEP.rise);
  // `+ 0` folds -0 into 0, so a resting page reads as exactly the origin.
  return { x: x + 0, y: y + 0 };
}

const n = (v: number) => String(Math.round(v * 100) / 100);

// The SVG transform that stands a sheet in the isometric plane at its place in the stack.
export function sheetTransform(step: number, fan = 0): string {
  const { x, y } = sheetOffset(step, fan);
  return `matrix(${ISO_COS.toFixed(4)} 0.5 0 1 ${n(x)} ${n(y)})`;
}

export const lineD = (line: BrandLine) => `M${BRAND_DETAIL.lineStart} ${line.v}H${line.to}`;

type SvgOptions = {
  variant?: BrandMarkVariant;
  scheme?: PrismScheme | 'auto';
  tone?: BrandMarkTone;
  // The one colour in `mono`; `currentColor` unless a press file names one.
  colour?: string;
  idPrefix?: string;
};

// The mark as a standalone SVG document. `light` / `dark` write literal colours (renderers without CSS variables or
// media queries: next/og's resvg, the PNG script); `auto` follows the viewer's prefers-color-scheme, for favicons.
// `mono` draws one colour, each sheet at its own opacity, with the lines and cells cut out through a mask.
// `idPrefix` keeps ids unique when several marks share one document.
export function brandMarkSvg({
  variant = 'compact',
  scheme = 'auto',
  tone = 'colour',
  colour = 'currentColor',
  idPrefix = '',
}: SvgOptions = {}): string {
  const full = variant === 'full';
  const detail = full ? BRAND_DETAIL.full : BRAND_DETAIL.compact;
  const id = (key: string) => `${idPrefix}${key}`;
  const svg = (inner: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BRAND_MARK_VIEWBOX}" style="isolation:isolate">${inner}</svg>`;
  const lines = (stroke: string) =>
    detail.lines
      .map(
        (l) =>
          `<path data-line="" d="${lineD(l)}" stroke="${stroke}" stroke-width="${l.width}" stroke-linecap="round" fill="none"/>`,
      )
      .join('');
  const cells = (stroke: string) =>
    full
      ? BRAND_DETAIL.full.cells
          .map(
            (c) =>
              `<rect x="${c.x}" y="${c.y}" width="${c.size}" height="${c.size}" rx="${c.radius}" stroke="${stroke}" stroke-width="2" fill="none"/>`,
          )
          .join('')
      : '';
  const at = (step: number, inner: string) => `<g transform="${sheetTransform(step)}">${inner}</g>`;

  if (tone === 'mono') {
    const mask = (key: string, cut: string, outline: string) =>
      `<mask id="${id(key)}" maskUnits="userSpaceOnUse" x="-10" y="-10" width="${W + 20}" height="${H + 20}">` +
      `<path d="${outline}" fill="#ffffff"/>${cut}</mask>`;
    const pageCut = mask('page-cut', lines('#000000'), PAGE_OUTLINE);
    const sheetCut = mask('sheet-cut', full ? cells('#000000') : '', SHEET_OUTLINE);
    const body = BRAND_SHEETS.map(({ key, step, monoOpacity }) => {
      if (key === 'page')
        return at(
          step,
          `<path d="${PAGE_OUTLINE}" fill="${colour}" opacity="${monoOpacity}" mask="url(#${id('page-cut')})"/>` +
            `<path d="${PAGE_FOLD}" fill="${colour}" opacity="0.5"/>`,
        );
      const cut = key === 'sheet' ? ` mask="url(#${id('sheet-cut')})"` : '';
      return at(
        step,
        `<path d="${SHEET_OUTLINE}" fill="${colour}" opacity="${monoOpacity}"${cut}/>`,
      );
    }).join('');
    return svg(`<defs>${pageCut}${sheetCut}</defs>${body}`);
  }

  const fixed = scheme === 'auto' ? null : PRISM_PALETTES[scheme];
  const stopColour = (stop: PrismStop) =>
    fixed ? ` stop-color="${fixed[stop]}"` : ` class="s-${stop}"`;
  const gradients = BRAND_GRADIENTS.map(({ key, vector: v, stops }) => {
    const inner = stops
      .map(
        ([stop, offset, opacity]) =>
          `<stop offset="${offset}%"${stopColour(stop)} stop-opacity="${opacity}"/>`,
      )
      .join('');
    return `<linearGradient id="${id(key)}" x1="${v.x1}%" y1="${v.y1}%" x2="${v.x2}%" y2="${v.y2}%">${inner}</linearGradient>`;
  });
  if (full) {
    gradients.push(
      `<linearGradient id="${id('sheen')}" x1="0%" y1="0%" x2="0%" y2="100%">` +
        `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.45"/>` +
        `<stop offset="100%" stop-color="#ffffff" stop-opacity="0.05"/></linearGradient>`,
    );
  }
  const css = (s: PrismScheme) =>
    PRISM_STOPS.map((stop) => `.s-${stop}{stop-color:${PRISM_PALETTES[s][stop]}}`).join('') +
    `.ink{stroke:${PRISM_PALETTES[s].highlight}}`;
  const style = fixed
    ? ''
    : `<style>${css('light')}@media (prefers-color-scheme:dark){${css('dark')}}</style>`;
  // The highlight ink, as a literal or a class the stylesheet colours by scheme.
  const ink = fixed ? fixed.highlight : 'currentColor';
  const inkClass = fixed ? '' : ' class="ink"';
  const withInk = (markup: string) =>
    fixed ? markup : markup.replace(/stroke="currentColor"/g, `stroke="currentColor"${inkClass}`);

  const edge = `<path d="${SHEET_EDGE}" stroke="${ink}" stroke-opacity="${detail.edge.opacity}" stroke-width="${detail.edge.width}" fill="none"/>`;
  const body = BRAND_SHEETS.map(({ key, step, gradient }) => {
    if (key !== 'page') {
      const grid =
        key === 'sheet' && full
          ? `<g opacity="${BRAND_DETAIL.full.cellOpacity}">${cells(ink)}</g>`
          : '';
      return at(step, `<path d="${SHEET_OUTLINE}" fill="url(#${id(gradient)})"/>${edge}${grid}`);
    }
    const sheen = full
      ? BRAND_DETAIL.full.sheen
          .map(
            (s) =>
              `<path d="${s.d}" stroke="url(#${id('sheen')})" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
          )
          .join('')
      : '';
    return at(
      step,
      `<path d="${PAGE_OUTLINE}" fill="url(#${id(gradient)})"/>` +
        `<g opacity="${detail.lineOpacity}">${lines(ink)}</g>` +
        `<path d="${PAGE_FOLD}" fill="url(#${id('fold')})"/>` +
        sheen,
    );
  }).join('');
  return svg(`${style}<defs>${gradients.join('')}</defs>${withInk(body)}`);
}
