import { describe, expect, it } from 'vitest';
import {
  ES_LANES,
  laneCentre,
  type Element,
  type StickyElement,
  type Tab,
} from '@livedoc/document';
import { formatOperation } from '../format-operation';
import { parseEditOperations } from '../parse';
import { applied, refused } from '../fixtures/outcomes';
import { run } from '../fixtures/run';
import { fixedIds } from '../fixtures/checkout-flow';
import { applyEditOperations } from '../apply';
import { validateEditOperations } from '../parse-json';

// `wall` (docs/specs/021-event-storming/event-storming.md Phase 11 "Through the CLI and the MCP"): the notes read off
// several photos of one wall, in wall order, stitched against the board and landed as a draft a person adds or
// discards. JSON form only.

const placed: Element = {
  id: 'placed',
  type: 'sticky',
  x: 1000,
  y: laneCentre(0, ES_LANES) - 100,
  width: 200,
  height: 200,
  label: 'Order Placed',
  esKind: 'domain-event',
};
const board = (...more: Element[]): Tab => ({
  id: 't',
  name: 'Board',
  kind: 'event-storming',
  elements: [placed, ...more],
});

// A photo 1000 px wide, notes 100 px square in a row, 200 px apart.
const photo = (words: string[], kind = 'domain-event') => ({
  width: 1000,
  height: 500,
  notes: words.map((w, i) => ({ kind, words: w, x: 50 + i * 200, y: 100, w: 100, h: 100 })),
});
const wall = (...photos: ReturnType<typeof photo>[]) => JSON.stringify({ op: 'wall', photos });
const drafts = (tab: Tab) =>
  tab.elements.filter((el): el is StickyElement => el.type === 'sticky' && el.esDraft === true);

describe('wall: parsing', () => {
  it('reads the JSON form and prints it back as itself', () => {
    const text = wall(photo(['A']));
    const parsed = parseEditOperations(text);
    if (!('operations' in parsed)) throw new Error('parsed');
    expect(parsed.operations[0]).toMatchObject({ op: 'wall' });
    expect(formatOperation(parsed.operations[0]!)).toBe(text);
  });

  it('has no line form', () => {
    expect(refused(run('wall photos', board()))).toMatchObject({ code: 'parse_error' });
  });

  it.each([
    ['no photos', { op: 'wall', photos: [] }],
    ['not a list', { op: 'wall', photos: 'x' }],
    ['a photo without a size', { op: 'wall', photos: [{ notes: [] }] }],
    [
      'a note without a box',
      { op: 'wall', photos: [{ width: 10, height: 10, notes: [{ words: 'A' }] }] },
    ],
    ['notes that are not a list', { op: 'wall', photos: [{ width: 10, height: 10, notes: 'A' }] }],
    [
      'a note that is not an object',
      { op: 'wall', photos: [{ width: 10, height: 10, notes: ['A'] }] },
    ],
    [
      'words that are not text',
      {
        op: 'wall',
        photos: [{ width: 10, height: 10, notes: [{ words: 3, x: 0, y: 0, w: 1, h: 1 }] }],
      },
    ],
    [
      'a kind that is not text',
      {
        op: 'wall',
        photos: [{ width: 10, height: 10, notes: [{ kind: 3, x: 0, y: 0, w: 1, h: 1 }] }],
      },
    ],
    ['a photo that is not an object', { op: 'wall', photos: ['x'] }],
  ])('refuses %s', (_why, op) => {
    expect(refused(run(JSON.stringify(op), board()))).toMatchObject({ code: 'parse_error' });
  });
});

describe('wall: applying', () => {
  it('lands the whole wall as a draft, the overlap once, clear of the board', () => {
    const { tab } = applied(
      run(wall(photo(['A', 'B', 'C', 'D']), photo(['C', 'D', 'E', 'F'])), board()),
    );
    const notes = drafts(tab);
    expect(notes.map((n) => n.label)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(notes.every((n) => n.esKind === 'domain-event' && n.fixedSize === true)).toBe(true);
    // Left to right, and right of the board's own note.
    const xs = notes.map((n) => n.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[0]!).toBeGreaterThan(placed.x);
  });

  it('leaves a note the board already has where it is', () => {
    const { tab } = applied(run(wall(photo(['Order Placed', 'Order Paid'])), board()));
    expect(drafts(tab).map((n) => n.label)).toEqual(['Order Paid']);
    expect(tab.elements.find((el) => el.id === 'placed')).toEqual(placed);
  });

  it('lands a note of no known kind, or no words, as an empty domain event', () => {
    const op = JSON.stringify({
      op: 'wall',
      photos: [
        {
          width: 1000,
          height: 500,
          notes: [
            { kind: 'mystery', x: 50, y: 50, w: 100, h: 100 },
            { x: 650, y: 50, w: 100, h: 100 },
          ],
        },
      ],
    });
    const { tab } = applied(run(op, board()));
    expect(drafts(tab)).toMatchObject([
      { esKind: 'domain-event', label: '' },
      { esKind: 'domain-event', label: '' },
    ]);
  });

  it('refuses where it does not belong', () => {
    const plain: Tab = { id: 't', name: 'Plain', elements: [] };
    expect(refused(run(wall(photo(['A'])), plain))).toMatchObject({
      code: 'not_event_storming',
    });
    const draft = { ...placed, id: 'd', esDraft: true } as Element;
    expect(refused(run(wall(photo(['A'])), board(draft)))).toMatchObject({ code: 'draft_open' });
  });

  it('refuses more photos or notes than one import takes', () => {
    const many = Array.from({ length: 21 }, () => photo(['A']));
    expect(refused(run(wall(...many), board()))).toMatchObject({ code: 'too_large' });
    // As an agent sends it: the JSON body, which has no line length.
    const crowded = photo(Array.from({ length: 401 }, (_, i) => `N${i}`));
    const parsed = validateEditOperations([{ op: 'wall', photos: [crowded] }]);
    if (!('operations' in parsed)) throw new Error('parsed');
    const outcome = applyEditOperations(board(), parsed.operations, { makeId: fixedIds() });
    expect(refused(outcome)).toMatchObject({ code: 'too_large' });
  });

  it('refuses a wall with nothing to land', () => {
    const empty = JSON.stringify({ op: 'wall', photos: [{ width: 10, height: 10, notes: [] }] });
    expect(refused(run(empty, board()))).toMatchObject({ code: 'nothing_to_add' });
  });
});
