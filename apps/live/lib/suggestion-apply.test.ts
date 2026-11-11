import { describe, expect, it } from 'vitest';
import {
  ES_LANES,
  ES_NOTE_GAP,
  laneCentre,
  type Element,
  type StickyElement,
} from '@livedoc/document';
import {
  applyAllSuggestions,
  applySuggestion,
  dismissSuggestions,
  suggestionPreview,
} from './suggestion-apply';

// Applying and dismissing suggestions (docs/specs/021-event-storming/suggestions.md "Applying and dismissing"): a
// suggestion becomes an ordinary note exactly where the next-note buttons would land one, in one step.

// Notes sit on lane 2 (centre 580) unless a test says otherwise.
function note(id: string, kind: string, x: number, lane = 2): StickyElement {
  return {
    id,
    type: 'sticky',
    esKind: kind,
    fixedSize: true,
    label: id,
    x,
    y: laneCentre(lane, ES_LANES) - 100,
    width: 200,
    height: 200,
  } as StickyElement;
}

function suggestion(
  id: string,
  kind: string,
  anchorId: string,
  side: 'before' | 'after' | 'above' | 'below',
): StickyElement {
  return { ...note(id, kind, -5000, 0), esSuggestion: { anchorId, side } };
}

const byId = (els: Element[], id: string) => els.find((el) => el.id === id) as StickyElement;
const STEP = 200 + ES_NOTE_GAP;

describe('applySuggestion', () => {
  it('lands a suggestion after its anchor as an ordinary note', () => {
    const els = [note('e', 'domain-event', 1000), suggestion('p', 'domain-event', 'e', 'after')];
    const out = applySuggestion(els, 'p');
    const p = byId(out, 'p');
    expect(p.esSuggestion).toBeUndefined();
    expect('esSuggestion' in p).toBe(false);
    expect([p.x, p.y]).toEqual([1000 + STEP, byId(els, 'e').y]);
  });

  it('opens the board when the spot before the anchor is taken, as the next-note button does', () => {
    const els = [
      note('a', 'domain-event', 1000 - STEP),
      note('e', 'domain-event', 1000),
      note('z', 'domain-event', 1000 + STEP),
      suggestion('c', 'domain-event', 'e', 'before'),
    ];
    const out = applySuggestion(els, 'c');
    expect(byId(out, 'a').x).toBe(1000 - STEP);
    expect(byId(out, 'c').x).toBe(1000);
    expect(byId(out, 'e').x).toBe(1000 + STEP);
    expect(byId(out, 'z').x).toBe(1000 + 2 * STEP);
  });

  it('lands above with the left edges lined up, on the lane above', () => {
    const els = [
      note('cmd', 'domain-event', 1000),
      suggestion('act', 'domain-event', 'cmd', 'above'),
    ];
    const act = byId(applySuggestion(els, 'act'), 'act');
    expect(act.x).toBe(1000);
    expect(act.y + act.height / 2).toBe(laneCentre(1, ES_LANES));
  });

  it('takes the nearest free slot along the lane when the spot above is taken', () => {
    const els = [
      note('cmd', 'domain-event', 1000),
      note('taken', 'domain-event', 1000, 3),
      suggestion('rm', 'domain-event', 'cmd', 'below'),
    ];
    const rm = byId(applySuggestion(els, 'rm'), 'rm');
    expect(rm.y + rm.height / 2).toBe(laneCentre(3, ES_LANES));
    expect(rm.x === 1000 + STEP || rm.x === 1000 - STEP).toBe(true);
    expect(byId(applySuggestion(els, 'rm'), 'taken').x).toBe(1000);
  });

  it('never lets another open suggestion take a spot or travel as a note', () => {
    const els = [
      note('e', 'domain-event', 1000),
      // An open suggestion parked exactly where `p` would land: invisible, so not in the way.
      {
        ...suggestion('other', 'domain-event', 'e', 'above'),
        x: 1000 + STEP,
        y: note('e', 'x', 0).y,
      },
      suggestion('p', 'domain-event', 'e', 'after'),
    ];
    const out = applySuggestion(els, 'p');
    expect(byId(out, 'p').x).toBe(1000 + STEP);
    expect(byId(out, 'other').esSuggestion).toBeDefined();
  });

  it('applies a chain from its root in the same step', () => {
    const els = [
      note('e', 'domain-event', 1000),
      suggestion('c', 'domain-event', 'e', 'before'),
      suggestion('a', 'domain-event', 'c', 'above'),
    ];
    const out = applySuggestion(els, 'a');
    expect(byId(out, 'c').esSuggestion).toBeUndefined();
    expect(byId(out, 'a').esSuggestion).toBeUndefined();
    expect(byId(out, 'a').x).toBe(byId(out, 'c').x);
  });

  it('sweeps orphans with the apply', () => {
    const els = [
      note('e', 'domain-event', 1000),
      suggestion('p', 'domain-event', 'e', 'after'),
      suggestion('o', 'domain-event', 'gone', 'after'),
    ];
    expect(applySuggestion(els, 'p').map((el) => el.id)).toEqual(['e', 'p']);
  });

  it('leaves the board alone for an id that is no open suggestion', () => {
    const els = [note('e', 'domain-event', 1000)];
    expect(applySuggestion(els, 'e')).toBe(els);
    expect(applySuggestion(els, 'missing')).toBe(els);
  });

  it('drops a suggestion whose chain ends nowhere instead of landing it', () => {
    const els = [note('e', 'domain-event', 1000), suggestion('o', 'domain-event', 'gone', 'after')];
    expect(applySuggestion(els, 'o').map((el) => el.id)).toEqual(['e']);
  });
});

describe('applyAllSuggestions', () => {
  it('applies every open suggestion in timeline order, each on the board the last left', () => {
    const els = [
      note('e1', 'domain-event', 1000),
      note('e2', 'domain-event', 1000 + STEP),
      suggestion('c2', 'domain-event', 'e2', 'before'),
      suggestion('c1', 'domain-event', 'e1', 'before'),
    ];
    const out = applyAllSuggestions(els);
    expect(out.every((el) => (el as StickyElement).esSuggestion === undefined)).toBe(true);
    const xs = ['c1', 'e1', 'c2', 'e2'].map((id) => byId(out, id).x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs).size).toBe(4);
  });

  it('leaves a board without suggestions as it is', () => {
    const els = [note('e', 'domain-event', 1000)];
    expect(applyAllSuggestions(els)).toBe(els);
  });
});

describe('dismissSuggestions', () => {
  it('removes a suggestion with the ones chained on it, and the orphans', () => {
    const els = [
      note('e', 'domain-event', 1000),
      suggestion('c', 'domain-event', 'e', 'before'),
      suggestion('a', 'domain-event', 'c', 'above'),
      suggestion('p', 'domain-event', 'e', 'after'),
      suggestion('o', 'domain-event', 'gone', 'after'),
    ];
    expect(dismissSuggestions(els, ['c']).map((el) => el.id)).toEqual(['e', 'p']);
  });

  it('never removes a note, even when asked to', () => {
    const els = [note('e', 'domain-event', 1000)];
    expect(dismissSuggestions(els, ['e'])).toBe(els);
  });
});

describe('suggestionPreview', () => {
  it('shows the board as Apply All would leave it: who stands aside, and where each lands', () => {
    const els = [
      note('a', 'domain-event', 1000 - STEP),
      note('e', 'domain-event', 1000),
      suggestion('c', 'domain-event', 'e', 'before'),
      suggestion('o', 'domain-event', 'gone', 'after'),
      {
        id: 'arrow',
        type: 'arrow',
        from: { kind: 'free', x: 0, y: 0 },
        to: { kind: 'free', x: 9, y: 9 },
      } as Element,
    ];
    const preview = suggestionPreview(els);
    expect(preview.spots.has('o')).toBe(false);
    expect(preview.shiftX.get('e')).toBe(STEP);
    expect(preview.shiftX.has('a')).toBe(false);
    expect(preview.spots.get('c')).toMatchObject({ x: 1000, width: 200 });
  });

  it('is empty on a board without suggestions', () => {
    const preview = suggestionPreview([note('e', 'domain-event', 1000)]);
    expect(preview.shiftX.size).toBe(0);
    expect(preview.spots.size).toBe(0);
  });
});
