// What a page's fill reads as (docs/specs/007-editor/pages-mode.md "Backgrounds"): its tone, whether it is
// dark, and the ink its pattern takes. A leaf of the document model: a form's cover band paints a fill and
// its pattern with these, and needs neither the page's export frame nor the elements on it
// (docs/specs/016-platform/web-performance.md "Nothing heavy in what every route ships"). Pure.
import { isLightColor } from './colour-math';
import type { Page, PageBackground, PageFill } from './page';
import { pageImageTone } from './page-image';

// The pattern's pitch on a page, in px (the page panel's dots, grid and lines).
export const PAGE_PATTERN_PITCH = 24;

/** The colour a page's fill reads as: a solid's colour, a gradient's two stops averaged, a
 *  picture's tone under its overlay. */
export function pageFillTone(fill: PageFill): string {
  if (fill.kind === 'solid') return fill.color;
  if (fill.kind === 'image') return pageImageTone(fill);
  const rgb = (hex: string) => {
    const h = hex.length === 4 ? hex.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : hex;
    return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  };
  const a = rgb(fill.from);
  const b = rgb(fill.to);
  return (
    '#' +
    a
      .map((v, i) =>
        Math.round((v + b[i]!) / 2)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** Whether a page's fill is dark: its elements with no colour of their own take light ink. */
export function pageIsDark(page: Pick<Page, 'background'>): boolean {
  const fill = page.background?.fill;
  return !!fill && !isLightColor(pageFillTone(fill));
}

/** The pattern's ink on a page: faint white on a dark fill, faint slate on a light one (and on the
 *  plain paper, whose sheet sets it by class on screen). */
export function pagePatternInk(background: PageBackground | undefined): string {
  return pageIsDark({ background }) ? 'rgb(255 255 255 / 0.14)' : 'rgb(15 23 42 / 0.1)';
}
