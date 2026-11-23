// Placed pictures in the writing (docs/specs/034-text-documents/objects.md "In the editor"): each placed picture marked
// with its layout for its node view to draw it out of its line, and the room a Wrap or Break picture keeps the text
// clear of floated at its paragraph's start. A picture fixed on the page is moved by its paragraph's place on its
// page, measured once the pages are laid out (`measurePlacedShifts`) and held, mapped through edits, until measured
// again.
import type { Node as PmNode } from 'prosemirror-model';
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { PICTURE, PicturePlacements } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { pageIndexAt } from './pagination/pagination-plugin';
import {
  PLACED_ROOM_CLASS,
  placedLayout,
  roomStyle,
  type PlacedLayout,
  type PlacedShift,
} from './text-document-picture-placed';

// A shift this much from the one held, in points, is the same: measuring again changes nothing.
const SHIFT_SAME_PT = 0.5;
// CSS pixels to points.
const PT_PER_PX = 72 / 96;

export type PlacedPicturesOptions = {
  /** The width of the column the paragraph at `pos` stands in, in points. */
  readonly columnWidth: (doc: PmNode, pos: number) => number;
  /** A page's sheet by its index, which a picture fixed on that page is placed from; none where pages are not laid. */
  readonly sheetOf?: (page: number) => Element | null;
};

type PlacedState = {
  readonly shifts: ReadonlyMap<number, PlacedShift>;
  readonly layouts: ReadonlyMap<number, PlacedLayout>;
  readonly decorations: DecorationSet;
};

const key = new PluginKey<PlacedState>('textDocumentPlacedPictures');

function placedState(
  doc: PmNode,
  shifts: ReadonlyMap<number, PlacedShift>,
  options: PlacedPicturesOptions,
): PlacedState {
  const layouts = new Map<number, PlacedLayout>();
  const decorations: Decoration[] = [];
  doc.descendants((node, pos, parent) => {
    if (node.type.name !== PICTURE || !parent) return !node.isTextblock || node.childCount > 0;
    if (!PicturePlacements.of(node.attrs.placement)) return false;
    const layout = placedLayout(node.attrs, options.columnWidth(doc, pos), shifts.get(pos));
    if (!layout) return false;
    layouts.set(pos, layout);
    const room = layout.room;
    if (room) {
      const start = doc.resolve(pos).start();
      const style = roomStyle(room);
      decorations.push(
        Decoration.widget(
          start,
          () => {
            const dom = document.createElement('span');
            dom.className = PLACED_ROOM_CLASS;
            dom.setAttribute('aria-hidden', 'true');
            dom.contentEditable = 'false';
            dom.setAttribute('style', style);
            return dom;
          },
          { side: -1, key: `placed-room:${style}`, ignoreSelection: true },
        ),
      );
    }
    decorations.push(Decoration.node(pos, pos + node.nodeSize, {}, { placed: layout }));
    return false;
  });
  return { shifts, layouts, decorations: DecorationSet.create(doc, decorations) };
}

/** The placed pictures' marks and rooms, and the page-fixed ones' shifts. */
export function placedPicturesPlugin(options: PlacedPicturesOptions): Plugin<PlacedState> {
  return new Plugin<PlacedState>({
    key,
    state: {
      init: (_, state) => placedState(state.doc, new Map(), options),
      apply: (tr, previous, _old, state) => {
        const set = tr.getMeta(key) as ReadonlyMap<number, PlacedShift> | undefined;
        if (set) return placedState(state.doc, set, options);
        if (!tr.docChanged) return previous;
        const shifts = new Map<number, PlacedShift>();
        for (const [pos, shift] of previous.shifts) {
          const mapped = tr.mapping.mapResult(pos, 1);
          if (!mapped.deleted) shifts.set(mapped.pos, shift);
        }
        return placedState(state.doc, shifts, options);
      },
    },
    props: { decorations: (state) => key.getState(state)?.decorations },
    // Pictures fixed on the page measured again once the writing has been drawn, at most once a frame.
    view: () => {
      let frame: number | null = null;
      const sheetOf = options.sheetOf;
      return {
        update: (view) => {
          if (!sheetOf || frame !== null) return;
          const layouts = key.getState(view.state)?.layouts;
          const fixed = [...(layouts?.keys() ?? [])].some(
            (pos) =>
              PicturePlacements.of(view.state.doc.nodeAt(pos)?.attrs.placement)?.moves === 'page',
          );
          if (!fixed && !key.getState(view.state)?.shifts.size) return;
          frame = requestAnimationFrame(() => {
            frame = null;
            measurePlacedShifts(view, sheetOf);
          });
        },
        destroy: () => {
          if (frame !== null) cancelAnimationFrame(frame);
        },
      };
    },
  });
}

/** A placed picture's layout at `pos`, as drawn now. */
export function placedAt(state: EditorState, pos: number): PlacedLayout | undefined {
  return key.getState(state)?.layouts.get(pos);
}

/** Holds the page-fixed pictures' shifts; true when any changed (and the writing was told), false when none did. */
export function setPlacedShifts(
  view: EditorView,
  shifts: ReadonlyMap<number, PlacedShift>,
): boolean {
  const held = key.getState(view.state)?.shifts ?? new Map<number, PlacedShift>();
  const same =
    held.size === shifts.size &&
    [...shifts].every(([pos, s]) => {
      const was = held.get(pos);
      return (
        was !== undefined &&
        Math.abs(was.x - s.x) < SHIFT_SAME_PT &&
        Math.abs(was.y - s.y) < SHIFT_SAME_PT
      );
    });
  if (same) return false;
  view.dispatch(view.state.tr.setMeta(key, shifts).setMeta('addToHistory', false));
  return true;
}

/**
 * Measures where each page-fixed picture's paragraph stands on its anchor's page (`sheetOf` gives a page's sheet by its
 * index), and holds the shifts that place those pictures at their offsets from the page's top left corner.
 */
export function measurePlacedShifts(
  view: EditorView,
  sheetOf: (page: number) => Element | null,
): void {
  if (view.isDestroyed) return;
  const shifts = new Map<number, PlacedShift>();
  const writing = view.dom.getBoundingClientRect();
  const ratio = view.dom.offsetWidth > 0 ? writing.width / view.dom.offsetWidth : 1;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== PICTURE) return true;
    if (PicturePlacements.of(node.attrs.placement)?.moves !== 'page') return false;
    const sheet = sheetOf(pageIndexAt(view, pos));
    const paragraph = view.nodeDOM(view.state.doc.resolve(pos).before());
    if (!sheet || !(paragraph instanceof HTMLElement)) return false;
    const page = sheet.getBoundingClientRect();
    const own = paragraph.getBoundingClientRect();
    shifts.set(pos, {
      x: Math.round(((page.left - own.left) / ratio) * PT_PER_PX * 1000) / 1000,
      y: Math.round(((page.top - own.top) / ratio) * PT_PER_PX * 1000) / 1000,
    });
    return false;
  });
  if (setPlacedShifts(view, shifts))
    debugLog('[text-document] placed pictures fixed on the page measured', shifts.size);
}
