// A text document's pages read as drawn (docs/specs/034-text-documents/files-and-print.md "Downloading", PDF; plan 0019
// blueprint "PR 14f2"): with the surface in its printing look, every page's sheet and everything drawn over it, in
// the order it paints, as the PDF writer's items in points from the page's top left. Words are measured where they
// stand, so the PDF puts them there; pictures are noted here and drawn afterwards (capture-pictures.ts), since reading
// their pixels waits on loading and the layout must be read in one go. What it reads of the DOM comes through
// `CaptureMeasure`, so the rules are tested without a browser's layout.
import type { LaidOutFace, LaidOutItem, LaidOutLinkTarget } from '@livedoc/pdf-documents/laid-out';
import {
  CAPTURE_DECORATION_EM,
  CAPTURE_STRIKE_EM,
  CAPTURE_UNDERLINE_EM,
  decorationsOf,
  fontOf,
  overWhite,
  parseColour,
  transformed,
} from './capture-style';
import { printFaceOf } from './print-faces';

/** A box in the viewport. */
export type ViewRect = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

/** What the capture reads of the page; a browser's by default (`browserMeasure`). */
export type CaptureMeasure = {
  readonly style: (element: Element) => CSSStyleDeclaration;
  readonly rect: (element: Element) => ViewRect;
  readonly rects: (target: Element | Range) => readonly ViewRect[];
  /** Whether an element is drawn at all: displayed, visible, not see-through. */
  readonly drawn: (element: Element) => boolean;
  /** How far a font's ascent rises above its baseline, in CSS pixels at the font's own size. */
  readonly ascent: (font: string) => number;
};

/** A picture noted on a page, drawn afterwards: its item's place on its page and the element that shows it. */
export type NotedPicture = {
  readonly page: number;
  readonly index: number;
  readonly element: Element;
  readonly rect: ViewRect;
  /** Points per viewport pixel on its page. */
  readonly scale: number;
};

/** A page as captured: its size in points, its items, and what each was read from (for its tags). */
export type CapturedPage = {
  readonly width: number;
  readonly height: number;
  readonly items: LaidOutItem[];
  readonly sources: (Node | null)[];
};

export type Captured = {
  readonly pages: readonly CapturedPage[];
  readonly faces: readonly LaidOutFace[];
  readonly pictures: readonly NotedPicture[];
};

/** Elements whose drawing is a picture, read whole. */
const PICTURE_SELECTOR = '.text-document-picture-turn, svg, canvas, img';
/** What the capture never reads: the hidden sources of headers, footers and notes. */
const SKIP_SELECTOR = '[data-story-sources], [data-print-skip]';
const PT_PER_PX = 0.75;

const words = new Intl.Segmenter(undefined, { granularity: 'word' });
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

type Sheet = { rect: ViewRect; scale: number; page: CapturedPage };

/** The pages read from `root`, whose `[data-page-sheet]`s are the pages, `sizes` their sizes in CSS pixels. */
export function capturePages(
  root: Element,
  sizes: readonly { readonly width: number; readonly height: number }[],
  measure: CaptureMeasure,
): Captured {
  const sheetElements = [...root.querySelectorAll('[data-page-sheet]')];
  const sheets: Sheet[] = sheetElements.flatMap((element, at) => {
    const size = sizes[at];
    if (!size) return [];
    const rect = measure.rect(element);
    if (rect.width <= 0) return [];
    return [
      {
        rect,
        // Points per viewport pixel: CSS pixels per viewport pixel (zoom), then points.
        scale: (size.width / rect.width) * PT_PER_PX,
        page: {
          width: size.width * PT_PER_PX,
          height: size.height * PT_PER_PX,
          items: [],
          sources: [],
        },
      },
    ];
  });
  const faces = new Map<string, LaidOutFace>();
  const pictures: NotedPicture[] = [];
  const decorations = new Map<Element, { underline: string | null; strike: string | null }>();

  const sheetAt = (rect: ViewRect): { sheet: Sheet; index: number } | null => {
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const index = sheets.findIndex(
      ({ rect: page }) =>
        x >= page.left &&
        x <= page.left + page.width &&
        y >= page.top &&
        y <= page.top + page.height,
    );
    return index < 0 ? null : { sheet: sheets[index]!, index };
  };
  const toPage = (sheet: Sheet, rect: ViewRect) => ({
    x: (rect.left - sheet.rect.left) * sheet.scale,
    y: (rect.top - sheet.rect.top) * sheet.scale,
    width: rect.width * sheet.scale,
    height: rect.height * sheet.scale,
  });
  const put = (sheet: Sheet, item: LaidOutItem, source: Node | null) => {
    sheet.page.items.push(item);
    sheet.page.sources.push(source);
  };

  const boxOf = (element: Element, style: CSSStyleDeclaration, rect: ViewRect) => {
    const at = sheetAt(rect);
    if (!at) return;
    const { x, y, width, height } = toPage(at.sheet, rect);
    const fill = parseColour(style.backgroundColor);
    if (fill && width > 0 && height > 0)
      put(
        at.sheet,
        {
          kind: 'box',
          x,
          y,
          width,
          height,
          colour: fill.hex,
          ...(fill.alpha < 1 ? { opacity: fill.alpha } : {}),
        },
        element,
      );
    const side = (
      name: 'Top' | 'Right' | 'Bottom' | 'Left',
      x1: number,
      y1: number,
      x2: number,
      y2: number,
    ) => {
      const lineStyle = style[`border${name}Style`];
      const colour = parseColour(style[`border${name}Color`]);
      const thickness = parseFloat(style[`border${name}Width`]) * PT_PER_PX;
      if (!colour || lineStyle === 'none' || lineStyle === 'hidden' || !(thickness > 0)) return;
      const half = thickness / 2;
      const [ax, ay, bx, by] =
        name === 'Top'
          ? [x1, y1 + half, x2, y2 + half]
          : name === 'Bottom'
            ? [x1, y1 - half, x2, y2 - half]
            : name === 'Left'
              ? [x1 + half, y1, x2 + half, y2]
              : [x1 - half, y1, x2 - half, y2];
      put(
        at.sheet,
        {
          kind: 'line',
          x1: ax,
          y1: ay,
          x2: bx,
          y2: by,
          width: thickness,
          colour: overWhite(colour),
          ...(lineStyle === 'dashed' || lineStyle === 'dotted' ? { dash: lineStyle } : {}),
        },
        null,
      );
    };
    side('Top', x, y, x + width, y);
    side('Bottom', x, y + height, x + width, y + height);
    side('Left', x, y, x, y + height);
    side('Right', x + width, y, x + width, y + height);
  };

  const linkOf = (element: Element) => {
    const href = element.getAttribute('href') ?? '';
    let to: LaidOutLinkTarget | null = null;
    if (href.startsWith('#')) {
      const id = href.slice(1);
      const target = id ? root.ownerDocument.getElementById(decodeURIComponent(id)) : null;
      const at = target ? sheetAt(measure.rect(target)) : null;
      if (target && at) to = { page: at.index, top: toPage(at.sheet, measure.rect(target)).y };
    } else if (href) {
      to = { uri: (element as HTMLAnchorElement).href || href };
    }
    if (!to) return;
    for (const rect of measure.rects(element)) {
      const at = sheetAt(rect);
      if (!at) continue;
      put(at.sheet, { kind: 'link', ...toPage(at.sheet, rect), to }, element);
    }
  };

  /** The decorations an element draws through its text: its own, else its nearest ancestor's within its block. */
  const decorationOf = (element: Element): { underline: string | null; strike: string | null } => {
    const known = decorations.get(element);
    if (known) return known;
    const style = measure.style(element);
    const own = decorationsOf(style.textDecorationLine);
    const colour = parseColour(style.textDecorationColor) ?? parseColour(style.color);
    const ink = colour ? overWhite(colour) : '#000000';
    const block = /^(block|list-item|table-cell|flex|grid|table)$/.test(style.display);
    const parent = element.parentElement;
    const above =
      block || !parent || parent === root
        ? { underline: null, strike: null }
        : decorationOf(parent);
    const read = {
      underline: own.underline ? ink : above.underline,
      strike: own.strike ? ink : above.strike,
    };
    decorations.set(element, read);
    return read;
  };

  const textOf = (node: Text, element: Element) => {
    const style = measure.style(element);
    const ink = parseColour(style.color);
    if (!ink) return;
    const sizePx = parseFloat(style.fontSize);
    if (!(sizePx > 0)) return;
    const weight = Number(style.fontWeight) || (style.fontWeight === 'bold' ? 700 : 400);
    const italic = style.fontStyle === 'italic' || style.fontStyle.startsWith('oblique');
    const face = printFaceOf(style.fontFamily, weight, italic);
    faces.set(face.id, face);
    const ascent = measure.ascent(fontOf(style));
    const rtl = style.direction === 'rtl';
    const { underline, strike } = decorationOf(element);
    const colour = overWhite(ink);
    const text = node.data;
    const range = element.ownerDocument.createRange();
    const segments = [...words.segment(text)];
    // A word takes the white space after it, so the PDF's text reads with its spaces.
    const pieces: { start: number; end: number; tail: number }[] = [];
    for (const { segment, index } of segments) {
      const end = index + segment.length;
      if (/^\s+$/u.test(segment) && pieces.length > 0) pieces.at(-1)!.tail = end;
      else if (!/^\s+$/u.test(segment)) pieces.push({ start: index, end, tail: end });
    }
    const draw = (start: number, end: number, tail: number) => {
      range.setStart(node, start);
      range.setEnd(node, end);
      const rects = measure.rects(range).filter((rect) => rect.width > 0 && rect.height > 0);
      if (rects.length === 0) return;
      if (rects.length > 1 && end - start > 1) {
        // Across two lines (or turned about by direction): each character where it stands.
        for (const { segment, index } of graphemes.segment(text.slice(start, end)))
          draw(start + index, start + index + segment.length, start + index + segment.length);
        return;
      }
      const rect = rects[0]!;
      const at = sheetAt(rect);
      if (!at) return;
      const { x, y, width } = toPage(at.sheet, rect);
      // The ascent is in CSS pixels, so in points whatever the zoom.
      const baseline = y + ascent * PT_PER_PX;
      const size = sizePx * PT_PER_PX;
      put(
        at.sheet,
        {
          kind: 'text',
          x,
          baseline,
          width,
          text: transformed(text.slice(start, tail), style.textTransform),
          face: face.id,
          size,
          colour,
          ...(rtl ? { rtl } : {}),
        },
        node,
      );
      const line = (offset: number, ink: string) =>
        put(
          at.sheet,
          {
            kind: 'line',
            x1: x,
            y1: baseline + offset * size,
            x2: x + width,
            y2: baseline + offset * size,
            width: Math.max(0.5, CAPTURE_DECORATION_EM * size),
            colour: ink,
          },
          null,
        );
      if (underline) line(CAPTURE_UNDERLINE_EM, underline);
      if (strike) line(-CAPTURE_STRIKE_EM, strike);
    };
    for (const { start, end, tail } of pieces) draw(start, end, tail);
  };

  const walk = (element: Element) => {
    if (element.matches(SKIP_SELECTOR) || !measure.drawn(element)) return;
    const style = measure.style(element);
    if (element.matches(PICTURE_SELECTOR)) {
      const rect = measure.rect(element);
      const at = sheetAt(rect);
      if (at && rect.width > 0 && rect.height > 0) {
        const index = at.sheet.page.items.length;
        put(
          at.sheet,
          { kind: 'picture', ...toPage(at.sheet, rect), bytes: new Uint8Array(), format: 'png' },
          element,
        );
        pictures.push({ page: at.index, index, element, rect, scale: at.sheet.scale });
      }
      return;
    }
    if (element.localName === 'mfrac') fractionBar(element);
    else boxOf(element, style, measure.rect(element));
    if (element.localName === 'a' && element.hasAttribute('href')) linkOf(element);
    for (const child of element.childNodes) {
      if (child.nodeType === 3) textOf(child as Text, element);
      else if (child.nodeType === 1) walk(child as Element);
    }
  };

  /** A fraction's bar: a line between its numerator and its denominator, across the fraction. */
  const fractionBar = (element: Element) => {
    const [top, bottom] = [...element.children];
    if (!top || !bottom) return;
    const above = measure.rect(top);
    const below = measure.rect(bottom);
    const whole = measure.rect(element);
    const at = sheetAt(whole);
    if (!at) return;
    const { x, width } = toPage(at.sheet, whole);
    const y = ((above.top + above.height + below.top) / 2 - at.sheet.rect.top) * at.sheet.scale;
    const ink = parseColour(measure.style(element).color);
    put(
      at.sheet,
      {
        kind: 'line',
        x1: x,
        y1: y,
        x2: x + width,
        y2: y,
        width: 0.6,
        colour: ink ? overWhite(ink) : '#000000',
      },
      null,
    );
  };

  for (const child of root.children) walk(child);
  return { pages: sheets.map((sheet) => sheet.page), faces: [...faces.values()], pictures };
}

/** The browser's own measures. */
export const browserMeasure = (canvas: () => CanvasRenderingContext2D | null): CaptureMeasure => {
  const ascents = new Map<string, number>();
  return {
    style: (element) => getComputedStyle(element),
    rect: (element) => element.getBoundingClientRect(),
    rects: (target) => [...target.getClientRects()],
    drawn: (element) =>
      typeof element.checkVisibility === 'function'
        ? element.checkVisibility({ opacityProperty: true, visibilityProperty: true })
        : true,
    ascent: (font) => {
      const known = ascents.get(font);
      if (known !== undefined) return known;
      const context = canvas();
      if (!context) return 0;
      context.font = font;
      const ascent = context.measureText('Hg').fontBoundingBoxAscent;
      ascents.set(font, ascent);
      return ascent;
    },
  };
};
