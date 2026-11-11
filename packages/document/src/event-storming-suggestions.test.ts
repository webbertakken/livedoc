import { describe, expect, it } from 'vitest';
import { eventStormingKindOf, isEventStormingNote } from './event-storming';
import { ES_LANES, ES_LANE_PITCH, ES_NOTE_GAP, laneCentre } from './event-storming-lanes';
import {
  isSuggestion,
  isValidEsSuggestion,
  suggestionBounds,
  suggestionKindOf,
} from './event-storming-suggestions';
import { withDependents } from './arrow-rebind';
import { hiddenLayerElementIds, layerBands, visibleLayerElements } from './layers';
import { isValidElement } from './validate';
import type { Element } from './index';

const note = (id: string, x: number, extra: Record<string, unknown> = {}): Element =>
  ({
    id,
    type: 'sticky',
    x,
    y: laneCentre(0, ES_LANES) - 100,
    width: 200,
    height: 200,
    label: id,
    esKind: 'domain-event',
    ...extra,
  }) as Element;

const suggestion = (id: string, anchorId: string, side = 'before'): Element =>
  note(id, 0, { esKind: 'command', esSuggestion: { anchorId, side, reason: 'why' } });

describe('isSuggestion', () => {
  it('holds for a sticky carrying esSuggestion', () => {
    expect(isSuggestion(suggestion('s', 'e'))).toBe(true);
  });

  it('does not hold for a workshop note or another element', () => {
    expect(isSuggestion(note('e', 0))).toBe(false);
    expect(isSuggestion({ id: 'a', type: 'arrow' } as unknown as Element)).toBe(false);
  });
});

describe('a suggestion is no workshop note', () => {
  it('has no notation kind, so notation paths pass it by', () => {
    const s = suggestion('s', 'e');
    expect(eventStormingKindOf(s)).toBeNull();
    expect(isEventStormingNote(s)).toBe(false);
  });

  it('still has the kind it suggests', () => {
    expect(suggestionKindOf(suggestion('s', 'e'))).toBe('command');
    expect(suggestionKindOf(note('e', 0))).toBeNull();
  });
});

describe('isValidEsSuggestion', () => {
  it('takes an anchor and a side', () => {
    expect(isValidEsSuggestion({ anchorId: 'e', side: 'after' })).toBe(true);
    expect(
      isValidEsSuggestion({ anchorId: 'e', side: 'above', reason: 'r', gap: 'g', by: 'b' }),
    ).toBe(true);
  });

  it('refuses a missing anchor, an unknown side or over-long text', () => {
    expect(isValidEsSuggestion(null)).toBe(false);
    expect(isValidEsSuggestion({ anchorId: '', side: 'after' })).toBe(false);
    expect(isValidEsSuggestion({ anchorId: 'e', side: 'left' })).toBe(false);
    expect(isValidEsSuggestion({ anchorId: 'e', side: 'after', reason: 'x'.repeat(201) })).toBe(
      false,
    );
    expect(isValidEsSuggestion({ anchorId: 'e', side: 'after', gap: 'x'.repeat(41) })).toBe(false);
    expect(isValidEsSuggestion({ anchorId: 'e', side: 'after', by: 'x'.repeat(61) })).toBe(false);
    expect(isValidEsSuggestion({ anchorId: 'e', side: 'after', reason: 3 })).toBe(false);
  });

  it('is what element validation checks on a sticky', () => {
    expect(isValidElement(suggestion('s', 'e'))).toBe(true);
    expect(isValidElement(note('s', 0, { esSuggestion: { anchorId: 'e', side: 'nope' } }))).toBe(
      false,
    );
  });
});

describe('suggestionBounds', () => {
  const anchor = { x: 1000, y: laneCentre(2, ES_LANES) - 100, width: 200, height: 200 };

  it('puts before and after one gutter beside the anchor, centred on its lane', () => {
    expect(suggestionBounds(anchor, 'before', 'command')).toEqual({
      x: 1000 - ES_NOTE_GAP - 200,
      y: anchor.y,
      width: 200,
      height: 200,
    });
    const after = suggestionBounds(anchor, 'after', 'policy');
    expect(after.x).toBe(1200 + ES_NOTE_GAP);
    expect(after.y + after.height / 2).toBe(laneCentre(2, ES_LANES));
  });

  it('puts above and below on the next lane, the left edges lined up', () => {
    const above = suggestionBounds(anchor, 'above', 'actor');
    expect(above.x).toBe(1000);
    expect(above.y + above.height / 2).toBe(laneCentre(1, ES_LANES));
    const below = suggestionBounds(anchor, 'below', 'aggregate');
    expect(below.y + below.height / 2).toBe(laneCentre(1, ES_LANES) + 2 * ES_LANE_PITCH);
  });
});

describe('a suggestion goes with its anchor', () => {
  it('is taken by the delete cascade, transitively', () => {
    const els = [
      note('e', 0),
      suggestion('s1', 'e'),
      suggestion('s2', 's1'),
      suggestion('s3', 'x'),
    ];
    expect([...withDependents(els, new Set(['e']))].sort()).toEqual(['e', 's1', 's2']);
  });
});

describe('the layer funnels drop suggestions', () => {
  const els = [note('e', 0), suggestion('s', 'e')];

  it('leaves them out of the visible elements and the painted bands', () => {
    expect(visibleLayerElements(els, undefined).map((el) => el.id)).toEqual(['e']);
    expect(layerBands(els, undefined).flatMap((b) => b.elements.map((el) => el.id))).toEqual(['e']);
  });

  it('counts them hidden, so nothing hits or selects them', () => {
    expect([...hiddenLayerElementIds(els, undefined)]).toEqual(['s']);
  });

  it('returns the same array when nothing is hidden and nothing is suggested', () => {
    const plain = [note('e', 0)];
    expect(visibleLayerElements(plain, undefined)).toBe(plain);
  });

  it('keeps them out even when hidden layers are included', () => {
    expect(
      layerBands(els, undefined, { includeHidden: true }).flatMap((b) =>
        b.elements.map((el) => el.id),
      ),
    ).toEqual(['e']);
  });
});
