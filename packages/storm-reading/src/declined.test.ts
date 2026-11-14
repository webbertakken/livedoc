import { describe, expect, it } from 'vitest';
import { readDeclined } from './declined';
import { board } from './testing';

// docs/specs/021-event-storming/asks.md "What was declined".

describe('readDeclined', () => {
  const tab = {
    ...board(
      { id: 'e1', kind: 'domain-event', col: 0 },
      { id: 'e2', kind: 'domain-event', col: 1 },
    ),
  };

  it('lists what the board remembers, with the refs of what each was about', () => {
    expect(
      readDeclined({
        ...tab,
        esDeclined: [
          { type: 'note', words: 'Place Order', kind: 'command', about: ['e1'] },
          { type: 'context', words: 'Ordering', about: ['e1', 'e2'] },
        ],
      }),
    ).toEqual([
      { type: 'note', words: 'Place Order', kind: 'command', about: ['e1'], aboutRefs: ['e1'] },
      { type: 'context', words: 'Ordering', about: ['e1', 'e2'], aboutRefs: ['e1', 'e2'] },
    ]);
  });

  it('leaves out an entry about something no longer on the board', () => {
    expect(
      readDeclined({
        ...tab,
        esDeclined: [
          { type: 'remove', about: ['gone'] },
          { type: 'context', words: 'Ordering', about: ['e1', 'gone'] },
        ],
      }),
    ).toEqual([]);
  });

  it('reads none off a board that remembers nothing', () => {
    expect(readDeclined(tab)).toEqual([]);
  });
});
