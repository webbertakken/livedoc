// Where a web component's parts sit (docs/specs/009-elements/web-components.md): a stat row's cards, a process's
// steps, a header's links, a banner's and a hero caption's text. Pure, so the canvas faces (the web components family's,
// docs/specs/016-platform/web-performance.md) and the headless renderer place them from the same numbers. Apart from
// web-components.ts, which every board reads.
import { clamp } from './geometry-primitives';
import type { LayoutRect } from './web-components';

// Stat row: the cards share the width equally with a fixed gap, and the
// value's size follows the card height, so a taller row gets bigger numbers
// rather than more empty card. Rects are element-relative.
const STAT_GAP = 16;
export function statRowLayout(
  width: number,
  height: number,
  count: number,
): { cards: LayoutRect[]; valuePx: number; captionPx: number } {
  const n = Math.max(1, count);
  const gap = Math.min(STAT_GAP, (width * 0.2) / Math.max(1, n - 1));
  const cardW = Math.max(0, (width - gap * (n - 1)) / n);
  const cards = Array.from({ length: n }, (_, i) => ({
    x: i * (cardW + gap),
    y: 0,
    width: cardW,
    height,
  }));
  // Height drives the numbers, width caps them so a long value still fits a
  // narrow card.
  const valuePx = Math.round(clamp(Math.min(height * 0.34, cardW * 0.28), 12, 72));
  const captionPx = Math.round(clamp(valuePx * 0.45, 10, 22));
  return { cards, valuePx, captionPx };
}

// Process steps: the steps spread evenly across the width, connectors run
// between neighbouring circles, and the diameter follows the smaller of the
// height and the step spacing, so adding a step on a narrow element shrinks
// the circles instead of overlapping them.
type ProcessStepLayout = { cx: number; cy: number; r: number; caption: LayoutRect };
export function processLayout(
  width: number,
  height: number,
  count: number,
): {
  steps: ProcessStepLayout[];
  connectors: { x1: number; x2: number; y: number }[];
  numberPx: number;
  captionPx: number;
} {
  const n = Math.max(1, count);
  const colW = width / n;
  const captionPx = Math.round(clamp(height * 0.14, 10, 20));
  const captionH = Math.round(captionPx * 1.6);
  const captionGap = 6;
  const d = Math.max(8, Math.min(height - captionH - captionGap, colW * 0.62));
  const r = d / 2;
  const cy = r;
  const steps = Array.from({ length: n }, (_, i) => {
    const cx = colW * i + colW / 2;
    return {
      cx,
      cy,
      r,
      caption: { x: colW * i, y: d + captionGap, width: colW, height: captionH },
    };
  });
  // A connector stops short of each circle so its arrowhead reads.
  const inset = Math.min(8, colW * 0.06);
  const connectors = steps.slice(0, -1).map((s, i) => ({
    x1: s.cx + r + inset,
    x2: steps[i + 1]!.cx - r - inset,
    y: cy,
  }));
  const numberPx = Math.round(clamp(d * 0.4, 10, 48));
  return { steps, connectors, numberPx, captionPx };
}

// Header: logo + brand on the left, links right-aligned. Widening the bar
// opens the gap between them; links that no longer fit are dropped from the
// right rather than overlapping the brand. Widths are estimated from the
// character count (a headless renderer has no DOM to measure), and the canvas
// view positions from the same rects so the two agree.
const HEADER_BRAND_MIN = 90;
export function headerLayout(
  width: number,
  height: number,
  links: readonly string[],
): {
  pad: number;
  logo: { cx: number; cy: number; r: number };
  brand: LayoutRect;
  links: { text: string; rect: LayoutRect }[];
  linkPx: number;
} {
  const pad = Math.round(clamp(height * 0.26, 10, 28));
  const r = Math.max(6, Math.min(height * 0.29, 32));
  const logo = { cx: pad + r, cy: height / 2, r };
  const linkPx = Math.round(clamp(height * 0.18, 11, 20));
  const linkPadX = Math.round(linkPx * 0.8);
  const brandX = pad + r * 2 + Math.round(pad * 0.6);
  const right = width - pad;
  // Links read left to right, so keep the leading ones: measure them all,
  // then drop from the END until the rest fit beside the brand's minimum.
  const widths = links.map((t) => Math.ceil(t.length * linkPx * 0.58) + linkPadX * 2);
  const total = (k: number) => widths.slice(0, k).reduce((a, b) => a + b, 0);
  let count = links.length;
  while (count > 0 && right - total(count) < brandX + HEADER_BRAND_MIN) count--;
  const placed: { text: string; rect: LayoutRect }[] = [];
  let x = right - total(count);
  for (let i = 0; i < count; i++) {
    placed.push({ text: links[i]!, rect: { x, y: 0, width: widths[i]!, height } });
    x += widths[i]!;
  }
  const brandRight = placed.length > 0 ? placed[0]!.rect.x : right;
  const brand = { x: brandX, y: 0, width: Math.max(0, brandRight - brandX - 8), height };
  return { pad, logo, brand, links: placed, linkPx };
}

// Banner: the text region inside the padding, the subtitle under the title. (The Callout is a Card preset now and
// lays out with cardLayout, docs/specs/009-elements/card.md.)
export function bannerLayout(
  width: number,
  height: number,
): { title: LayoutRect; subtitle: LayoutRect; subtitlePx: number } {
  const pad = Math.round(clamp(Math.min(width, height) * 0.16, 8, 32));
  const subtitlePx = Math.round(clamp(height * 0.13, 11, 22));
  const subH = Math.round(subtitlePx * 1.5);
  const inner = { x: pad, y: pad, width: Math.max(0, width - pad * 2), height: height - pad * 2 };
  return {
    title: { ...inner, height: Math.max(0, inner.height - subH) },
    subtitle: { x: inner.x, y: inner.y + inner.height - subH, width: inner.width, height: subH },
    subtitlePx,
  };
}

// The hero's caption card: inset near the bottom, so the image above and
// around it stays reachable (double-click to set / change it).
export function heroCaptionLayout(
  width: number,
  height: number,
): {
  card: LayoutRect;
  title: LayoutRect;
  subtitle: LayoutRect;
  titlePx: number;
  subtitlePx: number;
} {
  const margin = Math.round(clamp(Math.min(width, height) * 0.06, 6, 28));
  const titlePx = Math.round(clamp(height * 0.075, 12, 34));
  const subtitlePx = Math.round(clamp(titlePx * 0.55, 10, 18));
  const padY = Math.round(titlePx * 0.6);
  const cardH = Math.min(height - margin * 2, padY * 2 + titlePx * 1.35 + subtitlePx * 1.5);
  const card = {
    x: margin,
    y: height - margin - cardH,
    width: Math.max(0, width - margin * 2),
    height: Math.max(0, cardH),
  };
  const padX = Math.round(titlePx * 0.7);
  const title = {
    x: card.x + padX,
    y: card.y + padY,
    width: Math.max(0, card.width - padX * 2),
    height: titlePx * 1.35,
  };
  const subtitle = {
    x: title.x,
    y: title.y + title.height,
    width: title.width,
    height: subtitlePx * 1.5,
  };
  return { card, title, subtitle, titlePx, subtitlePx };
}
