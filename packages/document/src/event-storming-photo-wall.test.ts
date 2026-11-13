import { describe, expect, it } from 'vitest';
import type { BoardNote, PhotoNote } from './event-storming-photo-match';
import { reconcilePhoto } from './event-storming-photo';
import { WALL_PHOTO_GAP, naturalCompare, stitchWall } from './event-storming-photo-wall';

// A whole wall from several photos (docs/specs/021-event-storming/event-storming.md Phase 11 "How the photos are
// stitched"). Photos are in normalised units (fractions of the photo's width); a square note is 0.1 wide, so a photo
// maps at 2000 canvas px per unit and one note is 200 px.

let nextId = 0;
function note(
  text: string,
  cx: number,
  cy: number,
  kind: PhotoNote['kind'] = 'domain-event',
): PhotoNote {
  nextId += 1;
  return { id: nextId, text, kind, size: 'square', cx, cy, w: 0.1, h: 0.1, row: 0, order: nextId };
}

const centreX = (a: { x: number; width: number }) => a.x + a.width / 2;
const textsOf = (additions: { text: string }[]) => additions.map((a) => a.text).sort();

describe('stitchWall', () => {
  it('stitches nothing from no photos, and skips a photo with no notes', () => {
    expect(stitchWall([], [])).toEqual({
      additions: [],
      matches: [],
      differences: [],
      seenAgain: [],
      placements: [],
    });
    const out = stitchWall([[], [note('A', 0.1, 0.1)]], []);
    expect(out.placements.map((p) => p.how)).toEqual(['skipped', 'board']);
    expect(textsOf(out.additions)).toEqual(['A']);
  });

  it('places one photo exactly as the single-photo import does', () => {
    const photo = [note('Order placed', 0.1, 0.1), note('Order paid', 0.25, 0.1)];
    const existing: BoardNote[] = [
      {
        id: 'b',
        text: 'Order placed',
        kind: 'domain-event',
        x: 1000,
        y: 480,
        width: 200,
        height: 200,
      },
    ];
    const single = reconcilePhoto(photo, existing);
    const wall = stitchWall([photo], existing);
    expect(wall.matches).toEqual(single.matches);
    expect(wall.differences).toEqual(single.differences);
    expect(wall.additions.map(({ photo: _p, ...a }) => a)).toEqual(single.additions);
  });

  it('stitches a photo onto the one before it where several matches agree', () => {
    const first = [
      note('A', 0.1, 0.1),
      note('B', 0.3, 0.1),
      note('C', 0.5, 0.1),
      note('D', 0.7, 0.1),
    ];
    // The second photo starts at C: C and D again, then E and F.
    const second = [
      note('C', 0.1, 0.1),
      note('D', 0.3, 0.1),
      note('E', 0.5, 0.1),
      note('F', 0.7, 0.1),
    ];
    const out = stitchWall([first, second], []);
    expect(out.placements[1]).toMatchObject({ how: 'overlap', agreeing: 2 });
    expect(textsOf(out.additions)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(out.seenAgain.map((s) => s.onPhoto)).toEqual([0, 0]);
    const x = (t: string) => centreX(out.additions.find((a) => a.text === t)!);
    // E lands one step right of D, as on the wall.
    expect(x('E') - x('D')).toBeCloseTo(x('D') - x('C'), 0);
  });

  it('never lets one chance match move a photo (the staircase)', () => {
    const first = [note('Same words', 0.1, 0.1), note('A', 0.3, 0.1)];
    // "Same words" appears again lower down the next stretch of wall: a different note with the same words.
    const second = [note('X', 0.1, 0.1), note('Y', 0.3, 0.1), note('Same words', 0.3, 0.6)];
    const out = stitchWall([first, second], []);
    expect(out.placements[1]!.how).toBe('beside');
    const top = (t: string) => out.additions.find((a) => a.text === t)!.y;
    expect(top('X')).toBe(top('A'));
    // Beside means right of the first photo, one gap clear.
    const a = out.additions.find((n) => n.text === 'A')!;
    const xNote = out.additions.find((n) => n.text === 'X')!;
    expect(xNote.x).toBeGreaterThanOrEqual(a.x + a.width + WALL_PHOTO_GAP - 1);
    expect(out.additions.filter((n) => n.text === 'Same words')).toHaveLength(2);
  });

  it('pairs notes only with their best match by words, so a near miss in the same layout never wins', () => {
    const words = (labels: string[]) =>
      labels.map((l, i) => note(`${l} happened`, 0.1 + i * 0.2, 0.1));
    const out = stitchWall([words(['A', 'B', 'C', 'D']), words(['C', 'D', 'E', 'F'])], []);
    expect(out.placements[1]).toMatchObject({ how: 'overlap', agreeing: 2 });
    expect(out.additions).toHaveLength(6);
  });

  it('fits the scale too when three or more matches agree', () => {
    const first = [
      note('A', 0.1, 0.1),
      note('B', 0.3, 0.1),
      note('C', 0.5, 0.1),
      note('D', 0.7, 0.1),
    ];
    // Shot from further away: the same notes, smaller and closer together.
    const second = [
      { ...note('B', 0.1, 0.1), w: 0.08, h: 0.08 },
      { ...note('C', 0.26, 0.1), w: 0.08, h: 0.08 },
      { ...note('D', 0.42, 0.1), w: 0.08, h: 0.08 },
      { ...note('E', 0.58, 0.1), w: 0.08, h: 0.08 },
    ];
    const out = stitchWall([first, second], []);
    expect(out.placements[1]).toMatchObject({ how: 'overlap', agreeing: 3 });
    expect(textsOf(out.additions)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('keeps the photo’s own scale when the agreeing notes have no spread to fit', () => {
    const pile = (x: number) => [note('A', x, 0.1), note('B', x, 0.1), note('C', x, 0.1)];
    const out = stitchWall([pile(0.1), pile(0.1)], []);
    expect(out.placements[1]).toMatchObject({ how: 'overlap', agreeing: 3, scale: 2000 });
  });

  it('takes a note at the same place and kind as the same paper, even unread', () => {
    const first = [note('A', 0.1, 0.1), note('B', 0.3, 0.1), note('', 0.5, 0.1)];
    const second = [
      note('A', 0.1, 0.1),
      note('B', 0.3, 0.1),
      note('', 0.5, 0.1),
      note('', 0.5, 0.1, 'command'),
    ];
    const out = stitchWall([first, second], []);
    // The unread event is the same paper; the command at the same spot is not (another kind).
    expect(out.additions).toHaveLength(4);
    expect(out.seenAgain).toHaveLength(3);
  });

  it('compares a photo with the last one that had notes', () => {
    const first = [note('A', 0.1, 0.1), note('B', 0.3, 0.1)];
    const third = [note('A', 0.1, 0.1), note('B', 0.3, 0.1), note('C', 0.5, 0.1)];
    const out = stitchWall([first, [], third], []);
    expect(out.placements.map((p) => p.how)).toEqual(['board', 'skipped', 'overlap']);
    expect(textsOf(out.additions)).toEqual(['A', 'B', 'C']);
  });

  it('marks every addition with the photo it came from', () => {
    const out = stitchWall([[note('A', 0.1, 0.1)], [note('B', 0.1, 0.1)]], []);
    expect(out.additions.map((a) => [a.text, a.photo])).toEqual([
      ['A', 0],
      ['B', 1],
    ]);
  });

  it('treats an unknown kind as the fallback kind when looking for the same paper', () => {
    const first = [note('A', 0.1, 0.1), note('B', 0.3, 0.1), note('', 0.5, 0.1)];
    const second = [note('A', 0.1, 0.1), note('B', 0.3, 0.1), note('', 0.5, 0.1, 'unknown')];
    expect(stitchWall([first, second], []).additions).toHaveLength(3);
  });
});

describe('naturalCompare', () => {
  it('orders file names as people number them', () => {
    const names = [
      'IMG_10.jpg',
      'IMG_9.jpg',
      'img_2.JPG',
      '20261112_173842.jpg',
      '20261112_173833.jpg',
    ];
    expect([...names].sort(naturalCompare)).toEqual([
      '20261112_173833.jpg',
      '20261112_173842.jpg',
      'img_2.JPG',
      'IMG_9.jpg',
      'IMG_10.jpg',
    ]);
    expect(naturalCompare('a', 'a')).toBe(0);
  });
});
