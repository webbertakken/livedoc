// Where a maximised or tab-filling Plan element sits in the canvas area (docs/specs/026-plan/plan-board.md "Maximised
// board", "It respects the chrome", "Fill Tab"): in the content frame the editor's chrome over the canvas leaves,
// measured from that chrome as it is now. The top line (the brand group, the actions group and the palette strip,
// topStripInset's) pushes the top down; the bottom line's groups (the tools group, the document group) push the bottom
// up; a layout panel (a MovablePanel marked `layoutChrome`; never a passing one like the Trash) pushes its side in; a
// sheet across the canvas pushes the top or bottom. The chrome itself is never moved or restyled. Pure but for
// `measureCanvasChrome`, which reads the DOM.
import { topStripInset } from './top-strip-inset';
import { ACTIONS_GROUP_SELECTOR, BRAND_GROUP_SELECTOR } from './top-line-clearance';

export type LayerInsets = { top: number; right: number; bottom: number; left: number };
const NO_INSETS: LayerInsets = { top: 0, right: 0, bottom: 0, left: 0 };

type Box = { left: number; top: number; right: number; bottom: number };
type ChromeBox = { kind: 'top' | 'panel' | 'bottom'; box: Box };

// The top line's groups at its ends (the brand group, the actions group); the strip itself is read by topStripInset.
export const TOP_LINE_SELECTOR = `${BRAND_GROUP_SELECTOR}, ${ACTIONS_GROUP_SELECTOR}`;
// The bottom line (BottomLine): a box across the canvas's foot; what it holds (its groups) is what takes room.
export const BOTTOM_LINE_SELECTOR = '[data-bottom-line]';
// The panels that are part of the layout (MovablePanel `layoutChrome`). The editor has none since the Palette and the
// Explorer became the strip and a popover (docs/specs/007-editor/toolbar-layout.md); the rule stays for a panel that
// joins the layout. A panel opened for a moment (the Trash, the item panel, a card search) is not one: it floats
// over the board, which never moves for it.
export const PANEL_SELECTOR = '[data-layout-chrome]';
// A panel wider than this share of the canvas is a sheet across it (a phone), not a side panel: it pushes the top or
// bottom instead. Half of the canvas plus a margin: no side panel is ever that wide on a desktop (they are 18-24rem).
const WIDE_PANEL_SHARE = 0.6;
// At most this share of the canvas is given up on each axis, so the element always keeps most of the screen even
// with every panel open on a small one.
export const MAX_INSET_SHARE = 0.45;

// The insets for `canvas` given the chrome over it (boxes in screen px). Only chrome over the canvas counts.
export function layerInsets(
  canvas: Box,
  chrome: readonly ChromeBox[],
  stripInset = 0,
): LayerInsets {
  const width = canvas.right - canvas.left;
  const height = canvas.bottom - canvas.top;
  const out = { ...NO_INSETS, top: Math.max(0, stripInset) };
  for (const { kind, box } of chrome) {
    const over =
      box.right > canvas.left &&
      box.left < canvas.right &&
      box.bottom > canvas.top &&
      box.top < canvas.bottom &&
      box.right > box.left &&
      box.bottom > box.top;
    if (!over) continue;
    const midY = (box.top + box.bottom) / 2;
    const low = midY > canvas.top + height / 2;
    if (kind === 'top' && !low) out.top = Math.max(out.top, box.bottom - canvas.top);
    else if (
      kind === 'bottom' ||
      (kind === 'panel' && box.right - box.left > width * WIDE_PANEL_SHARE)
    ) {
      if (low) out.bottom = Math.max(out.bottom, canvas.bottom - box.top);
      else out.top = Math.max(out.top, box.bottom - canvas.top);
    } else if (kind === 'panel') {
      if (box.left - canvas.left <= canvas.right - box.right)
        out.left = Math.max(out.left, box.right - canvas.left);
      else out.right = Math.max(out.right, canvas.right - box.left);
    }
  }
  const cap = (v: number, of: number) => Math.round(Math.min(v, of * MAX_INSET_SHARE));
  return {
    top: cap(out.top, height),
    bottom: cap(out.bottom, height),
    left: cap(out.left, width),
    right: cap(out.right, width),
  };
}

// The chrome over `canvas` now, read off the screen, as the insets of the content frame it leaves.
export function measureCanvasChrome(canvas: HTMLElement): LayerInsets {
  const boxes: ChromeBox[] = [];
  const shown = (el: Element) => getComputedStyle(el).visibility !== 'hidden';
  const read = (selector: string, kind: ChromeBox['kind']) => {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (shown(el)) boxes.push({ kind, box: el.getBoundingClientRect() });
    }
  };
  read(TOP_LINE_SELECTOR, 'top');
  read(PANEL_SELECTOR, 'panel');
  // The bottom line runs the canvas's width: its groups are what it covers (an empty slot takes no room).
  for (const line of document.querySelectorAll<HTMLElement>(BOTTOM_LINE_SELECTOR)) {
    if (shown(line)) for (const box of groupBoxes(line)) boxes.push({ kind: 'bottom', box });
  }
  return layerInsets(canvas.getBoundingClientRect(), boxes, topStripInset(canvas));
}

// The boxes of what `line` holds, looking through a wrapper that draws no box of its own (`display: contents`).
function groupBoxes(line: Element): DOMRect[] {
  const out: DOMRect[] = [];
  for (const child of line.children) {
    const style = getComputedStyle(child);
    if (style.visibility === 'hidden') continue;
    if (style.display === 'contents') {
      out.push(...groupBoxes(child));
      continue;
    }
    const b = child.getBoundingClientRect();
    if (b.width > 0 && b.height > 0) out.push(b);
  }
  return out;
}

export function sameInsets(a: LayerInsets, b: LayerInsets): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}
