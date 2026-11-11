import { describe, expect, it } from 'vitest';
import { suggestionBounds, type Element, type StickyElement } from '@livedoc/document';
import { suggestionHints, suggestionSpots, suggestionsInTimeline } from './suggestion-hints';

// Where suggestions show on a board with Show All off (docs/specs/021-event-storming/suggestions.md "How a person
// sees them"): one hint per anchor side, with a count, each suggestion's spot derived from its anchor.

function note(id: string, kind: string, x: number, y = 480): StickyElement {
  return {
    id,
    type: 'sticky',
    esKind: kind,
    fixedSize: true,
    x,
    y,
    width: 200,
    height: 200,
  } as StickyElement;
}

function suggestion(
  id: string,
  kind: string,
  anchorId: string,
  side: 'before' | 'after' | 'above' | 'below',
  label = id,
): StickyElement {
  return {
    ...note(id, kind, 0, 0),
    label,
    esSuggestion: { anchorId, side, reason: `why ${id}`, by: 'Claude' },
  };
}

const event = note('e', 'domain-event', 1000);

describe('suggestionSpots', () => {
  it('derives a spot from the anchor as it stands, not the stored place', () => {
    const s = suggestion('s', 'command', 'e', 'before');
    const spots = suggestionSpots([event, s]);
    expect(spots.get('s')).toEqual(suggestionBounds(event, 'before', 'command'));
  });

  it('chains a suggestion on a suggestion from its anchor spot', () => {
    const a = suggestion('a', 'command', 'e', 'before');
    const b = suggestion('b', 'actor', 'a', 'above');
    const spots = suggestionSpots([event, b, a]);
    expect(spots.get('b')).toEqual(suggestionBounds(spots.get('a')!, 'above', 'actor'));
  });

  it('leaves an orphan without a spot', () => {
    const orphan = suggestion('o', 'command', 'gone', 'before');
    const chained = suggestion('c', 'actor', 'o', 'above');
    expect(suggestionSpots([event, orphan, chained]).size).toBe(0);
  });

  it('survives an anchor cycle that only a corrupt copy could hold', () => {
    const a = suggestion('a', 'command', 'b', 'before');
    const b = suggestion('b', 'command', 'a', 'before');
    expect(suggestionSpots([a, b]).size).toBe(0);
  });

  it('ignores a suggestion anchored on something that is not a note', () => {
    const shape = { id: 'sh', type: 'shape', x: 0, y: 0, width: 10, height: 10 } as Element;
    const arrow = { id: 'ar', type: 'arrow' } as Element;
    const plain = { ...note('p', 'x', 0), esKind: undefined } as StickyElement;
    const els = [
      shape,
      arrow,
      plain,
      suggestion('s1', 'command', 'sh', 'before'),
      suggestion('s2', 'command', 'ar', 'before'),
      suggestion('s3', 'command', 'p', 'before'),
    ];
    expect(suggestionSpots(els).size).toBe(0);
  });
});

describe('suggestionHints', () => {
  it('shows one hint per anchor side, counting what it holds', () => {
    const els: Element[] = [
      event,
      suggestion('a', 'command', 'e', 'before'),
      suggestion('b', 'actor', 'e', 'before'),
      suggestion('c', 'policy', 'e', 'after'),
    ];
    const hints = suggestionHints(els);
    expect(hints.map((h) => [h.anchorId, h.side, h.suggestions.map((s) => s.id)])).toEqual([
      ['e', 'before', ['a', 'b']],
      ['e', 'after', ['c']],
    ]);
    expect(hints[0]!.kind).toBe('command');
    expect(hints[0]!.anchor).toBe(event);
  });

  it('folds a chain into the hint of the note it grows from', () => {
    const a = suggestion('a', 'command', 'e', 'before');
    const b = suggestion('b', 'actor', 'a', 'above');
    const hints = suggestionHints([event, b, a]);
    expect(hints).toHaveLength(1);
    expect(hints[0]!.side).toBe('before');
    expect(hints[0]!.suggestions.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('shows nothing for an orphan', () => {
    expect(suggestionHints([event, suggestion('o', 'command', 'gone', 'before')])).toEqual([]);
  });

  it('shows nothing on a board without suggestions', () => {
    expect(suggestionHints([event])).toEqual([]);
  });
});

describe('suggestionsInTimeline', () => {
  it('orders suggestions by where they would land, left to right, then top to bottom', () => {
    const later = note('l', 'domain-event', 2000);
    const els: Element[] = [
      later,
      event,
      suggestion('x', 'policy', 'l', 'after'),
      suggestion('y', 'actor', 'e', 'above'),
      suggestion('z', 'command', 'e', 'before'),
      suggestion('w', 'read-model', 'e', 'below'),
      suggestion('o', 'command', 'gone', 'before'),
    ];
    expect(suggestionsInTimeline(els).map((s) => s.suggestion.id)).toEqual(['z', 'y', 'w', 'x']);
  });
});
