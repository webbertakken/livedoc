// docs/specs/021-event-storming/board-review.md "Readiness".
import { describe, expect, it } from 'vitest';
import { formatReadiness, readinessOf } from './readiness';
import { readBoard } from './reading';
import { board } from './testing';

const context = (id: string, notes: string[]) =>
  ({
    id,
    type: 'shape',
    shape: 'square',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    label: id,
    esContext: { notes },
  }) as never;

describe('readinessOf', () => {
  it('counts events, gaps, open hotspots and events outside every context apart', () => {
    const reading = readBoard(
      board(
        { id: 'c1', kind: 'command', col: 0, words: 'Place Order' },
        { id: 'a1', kind: 'actor', col: 0, lane: -1, words: 'Guest' },
        { id: 'e1', kind: 'domain-event', col: 1, words: 'Order Placed' },
        { id: 'e2', kind: 'domain-event', col: 3, words: 'Meal Prepared' },
        { id: 'h1', kind: 'hotspot', col: 3, lane: 1, words: 'Allergies?' },
        { id: 'h2', kind: 'hotspot', col: 1, lane: 1, words: 'Tips?', extra: { esAnswer: 'No.' } },
        context('ordering', ['c1', 'e1']),
      ),
    );
    // e2 has no cause (a gap); h1 is open; e2 is in no context.
    expect(readinessOf(reading)).toEqual({
      events: 2,
      gaps: 1,
      openHotspots: 1,
      eventsOutsideContext: 1,
      ready: false,
    });
    expect(formatReadiness(readinessOf(reading))).toBe(
      '2 events · 1 gap · 1 open hotspot · 1 event outside a context',
    );
  });

  it('is ready when nothing is left to settle', () => {
    const reading = readBoard(
      board(
        { id: 'a1', kind: 'actor', col: 0, lane: -1, words: 'Guest' },
        { id: 'c1', kind: 'command', col: 0, words: 'Place Order' },
        { id: 'e1', kind: 'domain-event', col: 1, words: 'Order Placed' },
      ),
    );
    expect(readinessOf(reading)).toMatchObject({ events: 1, gaps: 0, ready: true });
    expect(formatReadiness(readinessOf(reading))).toBe('1 event · Ready to export');
  });

  it('is not ready without an event', () => {
    const readiness = readinessOf(readBoard(board()));
    expect(readiness).toMatchObject({ events: 0, ready: false });
    expect(formatReadiness(readiness)).toBe('No events yet');
  });
});
