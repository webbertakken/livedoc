// What a shape can become (docs/specs/008-canvas/canvas-and-palette.md "Shape"): the palette's Shapes and Devices, plain
// labelled outlines, and the mind node, so a box drawn first can join a mind map. Found by the same words the palette
// search finds them by. The structures' own parts (a lane, an entity, a Page) and anything carrying its own data, face
// or picture are placed fresh from the palette instead. Pure.
import { paletteRank } from '@livedoc/icons';
import { hasOwnFace, isSelfDrawingShape, type ShapeKind } from '@livedoc/document';
import { tileCategoryId } from '@/components/palette/palette-tile-defs';
import { SHAPE_TILES, shapeTileSearchItem } from './palette-search';

export type MorphTarget = { kind: ShapeKind; label: string; keywords: string };

// Kinds that are shapes in the palette but never a morph's result: a glyph, a sticker, a container.
const NOT_MORPHABLE = new Set<ShapeKind>(['icon', 'sticker', 'frame']);

// The palette categories whose shapes are plain outlines, and the one structure node a plain box may become.
const MORPH_CATEGORIES = new Set(['shapes', 'devices']);
const MORPH_STRUCTURE_KINDS = new Set<ShapeKind>(['mind-node']);

// A rank the palette search treats as "no match".
const NO_MATCH = 4;

// Whether a shape of `kind` may become another kind in place, and another may become it.
export const isMorphableShape = (kind: ShapeKind): boolean =>
  !NOT_MORPHABLE.has(kind) && !isSelfDrawingShape(kind) && !hasOwnFace(kind);

function buildTargets(): MorphTarget[] {
  const seen = new Set<ShapeKind>();
  const out: MorphTarget[] = [];
  for (const tile of SHAPE_TILES) {
    const item = shapeTileSearchItem(tile);
    const { type: _type, shapeKind, ...choice } = item.add;
    const offered =
      MORPH_CATEGORIES.has(tileCategoryId(tile)) || MORPH_STRUCTURE_KINDS.has(shapeKind);
    if (!offered || Object.keys(choice).length > 0 || seen.has(shapeKind)) continue;
    if (!isMorphableShape(shapeKind)) continue;
    seen.add(shapeKind);
    out.push({ kind: shapeKind, label: item.name, keywords: item.keywords });
  }
  return out;
}

export const MORPH_TARGETS: readonly MorphTarget[] = buildTargets();

// The targets matching `query`, best first (exact name, name prefix, name substring, keyword); all of them for none.
export function searchMorphTargets(query: string): readonly MorphTarget[] {
  const q = query.trim();
  if (!q) return MORPH_TARGETS;
  return MORPH_TARGETS.map((t, i) => ({
    t,
    i,
    rank: paletteRank(q, { name: t.label, keywords: t.keywords }),
  }))
    .filter((m) => m.rank < NO_MATCH)
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((m) => m.t);
}

// A kind's name as the palette writes it ("Mind Node"), for the grid's labels.
export const morphTargetLabel = (kind: ShapeKind): string | undefined =>
  MORPH_TARGETS.find((t) => t.kind === kind)?.label;
