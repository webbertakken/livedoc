// docs/specs/021-event-storming/board-structure.md "Pivotal events" and "Hotspot answers".
import { describe, expect, it } from 'vitest';
import { changeEventStormingKind, eventStormingNoteFields } from './event-storming';
import {
  ES_LANES,
  ES_LANE_HEIGHT,
  ES_LANE_PITCH,
  laneCentre,
  laneTop,
} from './event-storming-lanes';
import {
  HOTSPOT_ANSWER_MAX,
  PIVOTAL_TAPE_PX,
  answerOf,
  isPivotalEvent,
  isValidEsAnswer,
  laneNameElement,
  pivotalTapes,
  setAnswer,
  setPivotal,
} from './event-storming-structure';
import type { Element, StickyElement } from './index';
import { elementValidationIssue, isValidElement } from './validate';

const note = (id: string, kind: Parameters<typeof eventStormingNoteFields>[0], extra = {}) =>
  ({
    id,
    type: 'sticky',
    x: 0,
    y: 0,
    label: id,
    ...eventStormingNoteFields(kind),
    ...extra,
  }) as StickyElement;

describe('pivotal events', () => {
  it('marks a domain event and unmarks it', () => {
    const board: Element[] = [note('e1', 'domain-event'), note('e2', 'domain-event')];
    const marked = setPivotal(board, 'e1', true);
    expect(marked.map((el) => isPivotalEvent(el))).toEqual([true, false]);
    expect(marked[1]).toBe(board[1]);
    const unmarked = setPivotal(marked, 'e1', false);
    expect(unmarked[0]).not.toHaveProperty('esPivotal');
  });

  it('marks nothing but a domain event', () => {
    const board: Element[] = [
      note('c1', 'command'),
      { id: 't1', type: 'text', x: 0, y: 0, width: 10, height: 10 },
    ];
    expect(setPivotal(board, 'c1', true)).toBe(board);
    expect(setPivotal(board, 't1', true)).toBe(board);
    expect(setPivotal(board, 'gone', true)).toBe(board);
  });

  it('answers the same board when nothing changes', () => {
    const board: Element[] = [note('e1', 'domain-event', { esPivotal: true })];
    expect(setPivotal(board, 'e1', true)).toBe(board);
    const plain: Element[] = [note('e1', 'domain-event')];
    expect(setPivotal(plain, 'e1', false)).toBe(plain);
  });

  it('reads a mark on anything but a domain event as none', () => {
    expect(isPivotalEvent(note('c1', 'command', { esPivotal: true }))).toBe(false);
    expect(isPivotalEvent(note('e1', 'domain-event', { esPivotal: 'yes' }))).toBe(false);
  });
});

describe('hotspot answers', () => {
  it('keeps an answer on a hotspot, trimmed and cut to the limit', () => {
    const board: Element[] = [note('h1', 'hotspot')];
    const answered = setAnswer(board, 'h1', '  The customer,\n up front.  ');
    expect(answerOf(answered[0]!)).toBe('The customer, up front.');
    const long = setAnswer(board, 'h1', 'x'.repeat(HOTSPOT_ANSWER_MAX + 9));
    expect(answerOf(long[0]!)).toHaveLength(HOTSPOT_ANSWER_MAX);
  });

  it('reopens the question when the answer is emptied', () => {
    const board: Element[] = [note('h1', 'hotspot', { esAnswer: 'Yes.' })];
    const open = setAnswer(board, 'h1', '   ');
    expect(open[0]).not.toHaveProperty('esAnswer');
    expect(answerOf(open[0]!)).toBe('');
  });

  it('answers nothing but a hotspot, and the same board when nothing changes', () => {
    const board: Element[] = [
      note('e1', 'domain-event'),
      note('h1', 'hotspot', { esAnswer: 'Yes.' }),
    ];
    expect(setAnswer(board, 'e1', 'Yes.')).toBe(board);
    expect(setAnswer(board, 'gone', 'Yes.')).toBe(board);
    expect(setAnswer(board, 'h1', ' Yes. ')).toBe(board);
    expect(setAnswer([note('h2', 'hotspot')], 'h2', '')).toHaveLength(1);
  });

  it('reads an answer on anything but a hotspot, or a blank one, as open', () => {
    expect(answerOf(note('e1', 'domain-event', { esAnswer: 'Yes.' }))).toBe('');
    expect(answerOf(note('h1', 'hotspot', { esAnswer: '  ' }))).toBe('');
    expect(answerOf(note('h1', 'hotspot', { esAnswer: 4 }))).toBe('');
  });

  it('validates an answer as text within the limit', () => {
    expect(isValidEsAnswer('Yes.')).toBe(true);
    expect(isValidEsAnswer('x'.repeat(HOTSPOT_ANSWER_MAX + 1))).toBe(false);
    expect(isValidEsAnswer(3)).toBe(false);
  });
});

describe('changing a note’s kind', () => {
  it('drops the pivotal mark unless it stays a domain event', () => {
    const event = note('e1', 'domain-event', { esPivotal: true });
    expect(changeEventStormingKind(event, 'command')).not.toHaveProperty('esPivotal');
    expect(changeEventStormingKind(event, 'domain-event')).toHaveProperty('esPivotal', true);
  });

  it('drops the answer unless it stays a hotspot', () => {
    const hotspot = note('h1', 'hotspot', { esAnswer: 'Yes.' });
    expect(changeEventStormingKind(hotspot, 'policy')).not.toHaveProperty('esAnswer');
    expect(changeEventStormingKind(hotspot, 'hotspot')).toHaveProperty('esAnswer', 'Yes.');
  });
});

describe('element validation', () => {
  it('takes a pivotal mark that is true and an answer within the limit', () => {
    expect(isValidElement({ ...note('e1', 'domain-event', { esPivotal: true }), width: 200 })).toBe(
      true,
    );
    expect(isValidElement(note('h1', 'hotspot', { esAnswer: 'Yes.' }))).toBe(true);
  });

  it('names the field a bad mark or answer breaks', () => {
    expect(elementValidationIssue(note('e1', 'domain-event', { esPivotal: false }))).toMatchObject({
      field: 'esPivotal',
    });
    expect(
      elementValidationIssue(
        note('h1', 'hotspot', { esAnswer: 'x'.repeat(HOTSPOT_ANSWER_MAX + 1) }),
      ),
    ).toMatchObject({ field: 'esAnswer' });
  });
});

describe('a lane name (board-structure.md "Lane names")', () => {
  it('is muted text, right aligned, one gutter clear of the wall, on its lane', () => {
    const name = laneNameElement({ id: 'n1', name: 'Kitchen', lane: 2, wallLeft: 100 });
    expect(name).toEqual({
      id: 'n1',
      type: 'text',
      x: 100 - 16 - 180,
      y: 2 * 240 + 100 - 16,
      width: 180,
      height: 32,
      label: 'Kitchen',
      textSize: 'md',
      textColor: '#64748b',
      textAlignX: 'right',
    });
    expect(isValidElement(name)).toBe(true);
  });

  it('stands on the layer it is given', () => {
    const name = laneNameElement({
      id: 'n1',
      name: 'Kitchen',
      lane: 0,
      wallLeft: 0,
      layerId: 'layer:es:board',
    });
    expect(name.layerId).toBe('layer:es:board');
  });
});

// board-structure.md "Pivotal events": "The tape".
describe('the tape of a pivotal event', () => {
  const on = (
    id: string,
    kind: Parameters<typeof eventStormingNoteFields>[0],
    x: number,
    lane: number,
    extra = {},
  ) => {
    const fields = eventStormingNoteFields(kind);
    return note(id, kind, { x, y: laneCentre(lane, ES_LANES) - fields.height / 2, ...extra });
  };

  it('runs through the event’s centre, half a lane beyond the lanes the notes use', () => {
    const board: Element[] = [
      on('who', 'actor', 0, 0),
      on('placed', 'domain-event', 400, 2, { esPivotal: true }),
      on('then', 'policy', 700, 3),
    ];
    expect(pivotalTapes(board)).toEqual([
      {
        eventId: 'placed',
        x: 400 + 100 - PIVOTAL_TAPE_PX / 2,
        y: laneTop(0, ES_LANES) - ES_LANE_PITCH / 2,
        width: PIVOTAL_TAPE_PX,
        height:
          laneTop(3, ES_LANES) +
          ES_LANE_HEIGHT +
          ES_LANE_PITCH / 2 -
          (laneTop(0, ES_LANES) - ES_LANE_PITCH / 2),
      },
    ]);
  });

  it('answers a tape for each pivotal event, in document order, and none for a board without one', () => {
    const board: Element[] = [
      on('a', 'domain-event', 0, 2, { esPivotal: true }),
      on('b', 'domain-event', 500, 2),
      on('c', 'domain-event', 900, 2, { esPivotal: true }),
    ];
    expect(pivotalTapes(board).map((t) => t.eventId)).toEqual(['a', 'c']);
    expect(pivotalTapes([on('b', 'domain-event', 0, 2)])).toEqual([]);
    expect(pivotalTapes([])).toEqual([]);
  });

  it('counts a mark on a note that is no event for nothing', () => {
    expect(pivotalTapes([on('c', 'command', 0, 1, { esPivotal: true })])).toEqual([]);
  });

  it('measures the lanes from the workshop notes alone: no suggestion, no other element', () => {
    const board: Element[] = [
      on('placed', 'domain-event', 0, 2, { esPivotal: true }),
      on('maybe', 'policy', 300, 5, {
        esSuggestion: { anchorId: 'placed', side: 'below', reason: 'r' },
      }),
      { id: 'text', type: 'text', x: 0, y: -2000, width: 100, height: 30, label: 'far away' },
    ];
    const [tape] = pivotalTapes(board);
    expect(tape!.y).toBe(laneTop(2, ES_LANES) - ES_LANE_PITCH / 2);
    expect(tape!.height).toBe(ES_LANE_HEIGHT + ES_LANE_PITCH);
  });

  it('draws only the events shown, measured against the notes shown', () => {
    const board: Element[] = [
      on('who', 'actor', 0, 0),
      on('placed', 'domain-event', 0, 2, { esPivotal: true }),
      on('shipped', 'domain-event', 600, 2, { esPivotal: true }),
    ];
    const shown = board.filter((el) => el.id !== 'who' && el.id !== 'shipped');
    const tapes = pivotalTapes(board, shown);
    expect(tapes.map((t) => t.eventId)).toEqual(['placed']);
    expect(tapes[0]!.y).toBe(laneTop(2, ES_LANES) - ES_LANE_PITCH / 2);
  });
});
