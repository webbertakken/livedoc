// A whole wall from several photos (docs/specs/021-event-storming/event-storming.md Phase 11): the photos of one wall,
// in wall order, stitched into one set of additions. Pure, so the editor, the CLI and the MCP stitch alike.
//
// The single-photo import fits a photo to whatever on the board its words match. A sequence knows more: each photo
// continues the one before it. So a photo is matched only against its neighbour, an overlap counts only when several
// matches agree on where the photo sits, and a photo without that agreement goes beside its neighbour. One chance
// match (two notes that both say "Signed in") can then never drop a photo a screen lower.

import { eventStormingNoteSize, type EventStormingNoteKind } from './event-storming';
import {
  defaultPhotoScale,
  noteTextSimilarity,
  type BoardNote,
  type PhotoMatch,
  type PhotoNote,
} from './event-storming-photo-match';
import { placeNewNotes } from './event-storming-photo-place';
import { reconcilePhoto, UNKNOWN_KIND_FALLBACK, type PhotoAddition } from './event-storming-photo';

// How far apart (canvas px) two matches' implied placements may be and still agree. Safe range: 60 to 200.
export const WALL_AGREEMENT_PX = 120;
// How many different notes must agree for an overlap to count. Safe range: 2 to 4.
export const WALL_MIN_AGREEING = 2;
// How far clear of its neighbour a photo without an overlap lands (canvas px), as an unmatched single photo does.
export const WALL_PHOTO_GAP = 200;
// How close (canvas px) a note of the same kind must land to an already placed one to be the same paper seen again.
// About half a note: closer than any two notes on one wall. Safe range: 80 to 140.
export const WALL_SAME_NOTE_PX = 110;
// How far a fitted scale may stray from the photo's own. Safe range: 0.5 to 2.
export const WALL_SCALE_MIN = 0.7;
export const WALL_SCALE_MAX = 1.4;
// The most photos one wall takes (spec default). Safe range: 10 to 40.
export const WALL_MAX_PHOTOS = 20;
// Notes with words this alike are the same words, as the single-photo match reads them.
const SAME_WORDS = 0.72;

export type WallAddition = PhotoAddition & { photo: number };

export type WallPlacement = {
  photo: number;
  how: 'board' | 'overlap' | 'beside' | 'skipped';
  // Different notes that agreed on an overlap.
  agreeing: number;
  scale: number;
};

export type WallStitch = {
  additions: WallAddition[];
  // The first photo's notes the board already has, and those whose words differ from the board's.
  matches: PhotoMatch[];
  differences: ReturnType<typeof reconcilePhoto>['differences'];
  // Notes of a later photo that are paper an earlier photo already placed.
  seenAgain: { photo: number; detectedId: number; onPhoto: number }[];
  placements: WallPlacement[];
};

type Transform = { scale: number; tx: number; ty: number };
// A note where its photo puts it, in canvas space (its centre).
type Placed = { photo: number; kind: EventStormingNoteKind; text: string; x: number; y: number };

const kindOf = (n: PhotoNote): EventStormingNoteKind =>
  n.kind === 'unknown' ? UNKNOWN_KIND_FALLBACK : n.kind;
const at = (n: PhotoNote, t: Transform) => ({ x: t.tx + t.scale * n.cx, y: t.ty + t.scale * n.cy });
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)]!;

type Candidate = {
  id: number;
  dx: number;
  dy: number;
  px: number;
  py: number;
  qx: number;
  qy: number;
};

// Where photo `notes` sits against its neighbour, from the matches that agree; null when too few do.
function overlapWith(notes: PhotoNote[], neighbour: Placed[], scale: number) {
  // Only MUTUAL best matches by words: "C happened" pairs with "C happened", never with "A happened" one letter
  // off, which the same layout would otherwise make agree perfectly. Ties are all kept; agreement decides them.
  const scores = notes.map((n) =>
    neighbour.map((p) => (n.text ? noteTextSimilarity(n.text, p.text) : 0)),
  );
  const bestOfNote = scores.map((row) => Math.max(0, ...row));
  const bestOfNeighbour = neighbour.map((_, j) => Math.max(0, ...scores.map((row) => row[j]!)));
  const candidates: Candidate[] = [];
  notes.forEach((n, i) => {
    neighbour.forEach((p, j) => {
      const score = scores[i]![j]!;
      if (score < SAME_WORDS || score < bestOfNote[i]! || score < bestOfNeighbour[j]!) return;
      candidates.push({
        id: n.id,
        dx: p.x - scale * n.cx,
        dy: p.y - scale * n.cy,
        px: n.cx,
        py: n.cy,
        qx: p.x,
        qy: p.y,
      });
    });
  });
  let group: Candidate[] = [];
  let distinct = 0;
  for (const c of candidates) {
    const agree = candidates.filter(
      (o) => Math.hypot(o.dx - c.dx, o.dy - c.dy) <= WALL_AGREEMENT_PX,
    );
    const count = new Set(agree.map((a) => a.id)).size;
    if (count > distinct) {
      group = agree;
      distinct = count;
    }
  }
  if (distinct < WALL_MIN_AGREEING) return null;
  let t: Transform = {
    scale,
    tx: median(group.map((g) => g.dx)),
    ty: median(group.map((g) => g.dy)),
  };
  if (distinct >= 3) {
    const mean = (f: (g: Candidate) => number) =>
      group.reduce((s, g) => s + f(g), 0) / group.length;
    const [pxm, pym, qxm, qym] = [
      mean((g) => g.px),
      mean((g) => g.py),
      mean((g) => g.qx),
      mean((g) => g.qy),
    ];
    let num = 0;
    let den = 0;
    for (const g of group) {
      num += (g.px - pxm) * (g.qx - qxm) + (g.py - pym) * (g.qy - qym);
      den += (g.px - pxm) ** 2 + (g.py - pym) ** 2;
    }
    if (den > 1e-9 && num > 0) {
      const fitted = Math.min(scale * WALL_SCALE_MAX, Math.max(scale * WALL_SCALE_MIN, num / den));
      t = { scale: fitted, tx: qxm - fitted * pxm, ty: qym - fitted * pym };
    }
  }
  return { transform: t, agreeing: distinct };
}

// Right of the neighbour, one gap clear, top edges aligned.
function besideOf(notes: PhotoNote[], extent: Extent, scale: number): Transform {
  const minX = Math.min(...notes.map((n) => n.cx - n.w / 2));
  const minY = Math.min(...notes.map((n) => n.cy - n.h / 2));
  return { scale, tx: extent.right + WALL_PHOTO_GAP - scale * minX, ty: extent.top - scale * minY };
}

type Extent = { right: number; top: number };
const extentOf = (notes: PhotoNote[], t: Transform): Extent => ({
  right: Math.max(...notes.map((n) => t.tx + t.scale * (n.cx + n.w / 2))),
  top: Math.min(...notes.map((n) => t.ty + t.scale * (n.cy - n.h / 2))),
});

function raw(n: PhotoNote, t: Transform, photo: number): WallAddition {
  const kind = kindOf(n);
  const size = eventStormingNoteSize(kind);
  const c = at(n, t);
  return {
    photo,
    detectedId: n.id,
    kind,
    text: n.text,
    x: c.x - size.width / 2,
    y: c.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

export function stitchWall(photos: readonly PhotoNote[][], existing: BoardNote[]): WallStitch {
  const additions: WallAddition[] = [];
  const seenAgain: WallStitch['seenAgain'] = [];
  const placements: WallPlacement[] = [];
  let matches: PhotoMatch[] = [];
  let differences: WallStitch['differences'] = [];
  // Every note placed so far, for the same-paper check, and the last photo with notes, for the neighbour match.
  const placed: Placed[] = [];
  let neighbour: { notes: Placed[]; extent: Extent } | null = null;

  photos.forEach((notes, photo) => {
    if (notes.length === 0) {
      placements.push({ photo, how: 'skipped', agreeing: 0, scale: 0 });
      return;
    }
    const own = defaultPhotoScale(notes);
    let transform: Transform;
    if (neighbour === null) {
      // The first photo meets the board exactly as a single photo does.
      const reconciled = reconcilePhoto(notes, existing);
      matches = reconciled.matches;
      differences = reconciled.differences;
      transform = reconciled.transform;
      const matched = new Map(matches.map((m) => [m.detectedId, m.boardId]));
      for (const n of notes) {
        const board = existing.find((b) => b.id === matched.get(n.id));
        if (board)
          placed.push({
            photo,
            kind: kindOf(n),
            text: n.text,
            x: board.x + board.width / 2,
            y: board.y + board.height / 2,
          });
        else {
          additions.push(raw(n, transform, photo));
          placed.push({ photo, kind: kindOf(n), text: n.text, ...at(n, transform) });
        }
      }
      placements.push({ photo, how: 'board', agreeing: matches.length, scale: transform.scale });
    } else {
      const overlap = overlapWith(notes, neighbour.notes, own);
      transform = overlap?.transform ?? besideOf(notes, neighbour.extent, own);
      placements.push({
        photo,
        how: overlap ? 'overlap' : 'beside',
        agreeing: overlap?.agreeing ?? 0,
        scale: transform.scale,
      });
      const before = placed.length;
      for (const n of notes) {
        const c = at(n, transform);
        const same = placed
          .slice(0, before)
          .find(
            (p) => p.kind === kindOf(n) && Math.hypot(p.x - c.x, p.y - c.y) < WALL_SAME_NOTE_PX,
          );
        if (same) {
          seenAgain.push({ photo, detectedId: n.id, onPhoto: same.photo });
          continue;
        }
        additions.push(raw(n, transform, photo));
        placed.push({ photo, kind: kindOf(n), text: n.text, ...c });
      }
    }
    neighbour = {
      notes: notes.map((n) => ({ photo, kind: kindOf(n), text: n.text, ...at(n, transform) })),
      extent: extentOf(notes, transform),
    };
  });

  // Onto the lanes, as a single photo's notes land, against the board and each other.
  const landed = placeNewNotes(additions, existing);
  return {
    additions: landed.map((a, i) => ({ ...a, photo: additions[i]!.photo })),
    matches,
    differences,
    seenAgain,
    placements,
  };
}

// File names in the order people number them: digits compare as numbers, letters without regard to case.
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}
