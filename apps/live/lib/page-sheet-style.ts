// The CSS a sheet takes from its page's background (docs/specs/007-editor/pages-mode.md
// "Backgrounds"): its fill, its pattern inked for the fill, and its picture under its overlay. A slide,
// a page's picture and a form's cover band paint with it, so it reaches the document model's fill tone
// alone, never its export frame (docs/specs/016-platform/web-performance.md "Nothing heavy in what
// every route ships"). Pure.
import {
  PAGE_PATTERN_PITCH,
  pageImageTone,
  pagePatternInk,
  type PageBackground,
  type PageFill,
  type PagePattern,
} from '@livedoc/document';
import type { CSSProperties } from 'react';
import {
  pageImageCssUrl,
  pageImageOverlayCss,
  pageImagePositionCss,
  pageImageSrc,
} from './page-image-paint';

/** The CSS `background` of a fill: a colour, a linear gradient, or a picture's tone under its
 *  overlay (a swatch's stand-in for it). */
export function fillCss(fill: PageFill): string {
  if (fill.kind === 'solid') return fill.color;
  if (fill.kind === 'image') return pageImageTone(fill);
  return `linear-gradient(${fill.angle}deg, ${fill.from}, ${fill.to})`;
}

// The pattern's layers, drawn in `currentColor` so the sheet's `color` sets the ink.
function patternLayers(pattern: PagePattern): { image: string; size: string } {
  const p = PAGE_PATTERN_PITCH;
  switch (pattern) {
    case 'dots':
      return {
        image: 'radial-gradient(circle, currentColor 1.4px, transparent 1.9px)',
        size: `${p}px ${p}px`,
      };
    case 'grid':
      return {
        image:
          'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
        size: `${p}px ${p}px, ${p}px ${p}px`,
      };
    case 'lines':
      return {
        image: 'linear-gradient(transparent calc(100% - 1px), currentColor calc(100% - 1px))',
        size: `100% ${p}px`,
      };
  }
}

/**
 * A sheet's inline style for its background: the fill (absent leaves the paper to the sheet's own
 * classes, white or slate in dark chrome) and the pattern over it, inked faintly in the page's ink.
 * `color` is that ink, so the pattern reads on any fill. A picture paints from the source
 * `resolveImage` gives its gallery id (its fetched blob URL), over its tone until it has one, under
 * its overlay ("Image backgrounds").
 */
export function pageSheetStyle(
  background: PageBackground | undefined,
  // An article page's ruling (docs/specs/007-editor/article-pages.md "Article style"): its Lines
  // drawn at its body line pitch inside its margins, on the writing's baselines.
  ruling?: { pitch: number; inset: number; top: number },
  resolveImage?: (imageId: string) => string | undefined,
): CSSProperties {
  const fill = background?.fill;
  const style: CSSProperties = {};
  const images: string[] = [];
  const sizes: string[] = [];
  const clips: string[] = [];
  const positions: string[] = [];
  const repeats: string[] = [];
  const layer = (
    image: string,
    size: string,
    clip: string,
    position = '0 0',
    repeat = 'repeat',
  ) => {
    images.push(image);
    sizes.push(size);
    clips.push(clip);
    positions.push(position);
    repeats.push(repeat);
  };
  if (background?.pattern) {
    const pattern = patternLayers(background.pattern);
    if (ruling && background.pattern === 'lines') {
      layer(pattern.image, `100% ${ruling.pitch}px`, 'content-box');
      style.padding = `${ruling.top}px ${ruling.inset}px ${ruling.inset}px`;
      style.backgroundOrigin = 'content-box';
    } else {
      layer(pattern.image, pattern.size, 'border-box');
    }
  }
  if (fill?.kind === 'gradient') {
    layer(fillCss(fill), '100% 100%', 'border-box');
  } else if (fill?.kind === 'solid') {
    style.backgroundColor = fill.color;
  } else if (fill?.kind === 'image') {
    if (fill.overlay) layer(pageImageOverlayCss(fill.overlay), '100% 100%', 'border-box');
    const src = pageImageSrc(fill, resolveImage);
    const url = src ? pageImageCssUrl(src) : null;
    if (url) layer(url, 'cover', 'border-box', pageImagePositionCss(fill.position), 'no-repeat');
    // The picture's own tone under it, while it loads (and where it cannot).
    style.backgroundColor = pageImageTone({ tone: fill.tone });
  }
  if (images.length) {
    // The colour paints under the last layer's clip: a clear last layer keeps it to the border.
    if (clips[clips.length - 1] === 'content-box') {
      layer('linear-gradient(transparent, transparent)', '100% 100%', 'border-box');
    }
    style.backgroundImage = images.join(', ');
    style.backgroundSize = sizes.join(', ');
    style.backgroundClip = clips.join(', ');
    style.backgroundRepeat = repeats.every((r) => r === 'repeat') ? 'repeat' : repeats.join(', ');
    if (positions.some((p) => p !== '0 0')) style.backgroundPosition = positions.join(', ');
  }
  if (fill) style.color = pagePatternInk(background);
  return style;
}
