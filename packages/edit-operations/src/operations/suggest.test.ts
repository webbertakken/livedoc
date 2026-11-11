import { describe, expect, it } from 'vitest';
import { ES_LANES, ES_NOTE_GAP, laneCentre, type Element, type Tab } from '@livedoc/document';
import { formatOperation } from '../format-operation';
import { formatResultLines } from '../format-results';
import { parseEditOperations } from '../parse';
import { applied, refused } from '../fixtures/outcomes';
import { run } from '../fixtures/run';
import { checkoutFlow } from '../fixtures/checkout-flow';

const y = laneCentre(0, ES_LANES) - 100;
const event: Element = {
  id: 'placed',
  type: 'sticky',
  x: 1000,
  y,
  width: 200,
  height: 200,
  label: 'Order Placed',
  esKind: 'domain-event',
};
const box: Element = {
  id: 'box',
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 600,
  width: 100,
  height: 60,
};
const board = (...more: Element[]): Tab => ({
  id: 't',
  name: 'Board',
  kind: 'event-storming',
  elements: [event, box, ...more],
});
const suggestionOf = (tab: Tab, id: string) => tab.elements.find((el) => el.id === id)!;

describe('suggest: parsing', () => {
  it('reads the line form into the JSON form, and prints it back', () => {
    const parsed = parseEditOperations(
      'suggest command "Place Order" before=placed reason="who places it?" gap=event_without_cause id=place',
    );
    expect(parsed).toEqual({
      operations: [
        {
          op: 'suggest',
          kind: 'command',
          words: 'Place Order',
          side: 'before',
          anchor: 'placed',
          reason: 'who places it?',
          gap: 'event_without_cause',
          id: 'place',
        },
      ],
    });
    if (!('operations' in parsed)) throw new Error('parsed');
    expect(formatOperation(parsed.operations[0]!)).toBe(
      'suggest command "Place Order" before=placed reason="who places it?" gap=event_without_cause id=place',
    );
  });

  it('takes a quoted label as the anchor', () => {
    expect(parseEditOperations('suggest actor Cook above="Order Placed"')).toMatchObject({
      operations: [{ op: 'suggest', words: 'Cook', side: 'above', anchor: '"Order Placed"' }],
    });
  });

  it.each([
    ['suggest', 'a kind'],
    ['suggest "command" "x" before=a', 'a kind'],
    ['suggest command', 'the words'],
    ['suggest command "x"', 'one of before='],
    ['suggest command "x" before=a after=b', 'one of before='],
    ['suggest command "x" before=a fill=red', 'reason=, gap= or id='],
    ['suggest command "x" before=a stray', 'before=, after='],
    ['suggest command reason=x before=a', 'the words'],
  ])('refuses %s', (line, expected) => {
    const parsed = parseEditOperations(line);
    expect('errors' in parsed && parsed.errors[0]!.details.join(' ')).toContain(expected);
  });

  it('checks the JSON form', () => {
    const bad = parseEditOperations(
      JSON.stringify({ op: 'suggest', kind: 'command', words: 'x', anchor: 'a', side: 'left' }),
    );
    expect('errors' in bad && bad.errors[0]!.details[0]).toContain('member "side"');
    const missing = parseEditOperations(
      JSON.stringify({ op: 'suggest', kind: 'command', words: 'x' }),
    );
    expect('errors' in missing).toBe(true);
    const wrongType = parseEditOperations(
      JSON.stringify({ op: 'suggest', kind: 'command', words: 3, anchor: 'a', side: 'after' }),
    );
    expect('errors' in wrongType && wrongType.errors[0]!.details[0]).toContain('member "words"');
  });
});

describe('suggest: applying', () => {
  it('adds a suggestion beside its anchor and moves nothing', () => {
    const outcome = applied(
      run(
        'suggest command "Place Order" before=placed reason="every event has a cause" id=place',
        board(),
        {
          agentName: 'Claude',
        },
      ),
    );
    expect(suggestionOf(outcome.tab, 'place')).toMatchObject({
      type: 'sticky',
      esKind: 'command',
      label: 'Place Order',
      fillColor: '#93c5fd',
      fixedSize: true,
      x: 1000 - ES_NOTE_GAP - 200,
      y,
      esSuggestion: {
        anchorId: 'placed',
        side: 'before',
        reason: 'every event has a cause',
        by: 'Claude',
      },
    });
    expect(outcome.tab.elements.find((el) => el.id === 'placed')).toBe(event);
    expect(outcome.createdIds).toEqual(['place']);
  });

  it('mints an id from the words, collapses spaces, and leaves out what was not given', () => {
    const outcome = applied(run('suggest actor "  Head   Chef " above=placed', board()));
    const s = suggestionOf(outcome.tab, 'head-chef');
    expect(s).toMatchObject({
      label: 'Head Chef',
      esSuggestion: { anchorId: 'placed', side: 'above' },
    });
    expect(s.type === 'sticky' && s.esSuggestion).toEqual({ anchorId: 'placed', side: 'above' });
  });

  it('anchors on another suggestion, and keeps the anchor layer', () => {
    const layered = { ...event, layerId: 'layer:es:board' };
    const tab = board();
    tab.elements[0] = layered;
    const outcome = applied(
      run(
        'suggest command "Pay" before=placed id=pay\nsuggest actor "Guest" above=pay id=guest',
        tab,
      ),
    );
    expect(suggestionOf(outcome.tab, 'guest')).toMatchObject({
      layerId: 'layer:es:board',
      esSuggestion: { anchorId: 'pay' },
    });
  });

  it.each([
    ['suggest command "x" before=placed', checkoutFlow(), 'not_event_storming'],
    ['suggest thing "x" before=placed', board(), 'invalid_kind'],
    ['suggest command " " before=placed', board(), 'words_required'],
    [`suggest command "x" before=placed reason="${'r'.repeat(201)}"`, board(), 'reason_too_long'],
    [`suggest command "x" before=placed gap=${'g'.repeat(41)}`, board(), 'invalid_value'],
    ['suggest command "x" before=box', board(), 'anchor_not_a_note'],
    ['suggest command "x" before=nowhere', board(), 'target_not_found'],
    ['suggest command "x" before=placed id=Bad!', board(), 'invalid_value'],
  ])('refuses %s', (line, tab, code) => {
    expect(refused(run(line, tab)).code).toBe(code);
  });

  it('refuses the same suggestion twice on one anchor', () => {
    const rejection = refused(
      run(
        'suggest command "Place Order" before=placed\nsuggest command "place  order" after=placed',
        board(),
      ),
    );
    expect(rejection.code).toBe('duplicate_suggestion');
  });

  it('refuses past the board limit', () => {
    const many = Array.from({ length: 60 }, (_, i) => `suggest command "c${i}" before=placed`).join(
      '\n',
    );
    expect(refused(run(`${many}\nsuggest command "one more" before=placed`, board())).code).toBe(
      'too_many_suggestions',
    );
  });
});

describe('suggest: removal', () => {
  it('goes with its anchor, transitively, even when arrows are kept', () => {
    const suggested = applied(
      run(
        'suggest command "Pay" before=placed id=pay\nsuggest actor "Guest" above=pay id=guest',
        board(),
      ),
    );
    const outcome = applied(run('rm placed keep-arrows', suggested.tab));
    expect(outcome.tab.elements.map((el) => el.id)).toEqual(['box']);
    expect(formatResultLines(outcome.results)).toContain(
      '- guest  sticky "Guest" (anchored on pay)',
    );
  });
});
