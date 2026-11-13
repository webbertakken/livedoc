// docs/specs/008-canvas/canvas-and-palette.md "Element menu anchor": where an element's context menu opens.
// A pointer right-click opens it AT the pointer (`pointerMenuAnchor`), the shortest move to the next press.
// Every other entry point (the keyboard, a touch long-press, the toolbar's More, a face's `…`, the menu beside a
// label being edited) opens it BESIDE the element at its top-right corner (`elementMenuAnchor`), so it never covers
// what you're editing. `rightClickMenuAnchor` picks between the two for a `contextmenu`.

// ContextMenu renders at a fixed w-56 (14rem = 224px); used to decide whether
// the menu fits to the right of the element before it would clip off-screen.
const CONTEXT_MENU_WIDTH = 224;

// Breathing room between the element edge and the menu, so a thick border /
// selection ring isn't tucked under the menu's edge.
const GAP = 8;

// How far the menu sits off the pointer's tip: enough that the pointer rests outside it, so nothing in the menu is
// hovered (no tooltip, no highlighted row) the moment it opens, and little enough that it reads as at the pointer.
const POINTER_GAP = 2;

type Point = { x: number; y: number };
type ElementRect = { left: number; right: number; top: number };

// The x the menu's left edge sits at so it starts at `from` and runs right, or ends at `to` when the right lacks
// room; clamped into the viewport when neither side fits. Only ever called from an event handler, so `window` is
// always there.
function menuLeft(from: number, to: number): number {
  const rightmost = window.innerWidth - CONTEXT_MENU_WIDTH - GAP;
  const x = from <= rightmost ? from : to - CONTEXT_MENU_WIDTH;
  return Math.min(Math.max(x, GAP), rightmost);
}

// The menu's top-left for a pointer right-click: just below and right of the pointer, or on its left when the
// fixed-width menu wouldn't fit to the right. Vertical clamping is left to ContextMenu itself, which re-clamps as
// categories expand.
export function pointerMenuAnchor(pointer: Point): Point {
  return {
    x: menuLeft(pointer.x + POINTER_GAP, pointer.x - POINTER_GAP),
    y: pointer.y + POINTER_GAP,
  };
}

// The anchor for a `contextmenu` on an element: at the pointer when a pointer (mouse, trackpad, pen) asked, beside
// the element when the keyboard did (Shift+F10 / the Menu key has no pointer to open at), or at the event's point
// when the element can't be measured.
export function rightClickMenuAnchor({
  pointer,
  element,
  fromKeyboard,
}: {
  pointer: Point;
  element: ElementRect | null;
  fromKeyboard: boolean;
}): Point {
  if (!fromKeyboard) return pointerMenuAnchor(pointer);
  return element ? elementMenuAnchor(element) : pointer;
}

// Given an element's on-screen rect (DOMRect-like), return the screen-space
// (x, y) the context menu's top-left should sit at: the element's top-right
// corner + a gap, or its top-left minus the menu width + gap when there isn't
// room on the right. Vertical clamping is left to ContextMenu itself.
// When neither side fully fits (a wide element in a narrow window) the left-side fallback would land off-screen, so
// it clamps into the viewport: the menu stays reachable even if it must then overlap the element.
export function elementMenuAnchor(rect: ElementRect): Point {
  return { x: menuLeft(rect.right + GAP, rect.left - GAP), y: rect.top };
}

// The menu that opens beside a label being edited (useEditModeContextMenu): beside the element AND its floating text
// toolbar, which is centred on the element and wider than a small one (an icon, a short pill). Anchored on the
// element alone, the menu sat over the toolbar's right end, where its alignment control is. The toolbar widens the
// rect only sideways: the menu still starts at the element's top.
export function editMenuAnchor(
  element: { left: number; right: number; top: number },
  toolbar: { left: number; right: number } | null,
): { x: number; y: number } {
  if (!toolbar) return elementMenuAnchor(element);
  return elementMenuAnchor({
    left: Math.min(element.left, toolbar.left),
    right: Math.max(element.right, toolbar.right),
    top: element.top,
  });
}
