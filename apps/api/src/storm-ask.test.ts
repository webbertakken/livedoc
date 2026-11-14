import { describe, expect, it } from 'vitest';
import {
  candidateContexts,
  isSuggestion,
  noteChangesOf,
  openLanePlan,
  type Element,
} from '@livedoc/document';
import { ASK_BY, STORM_ASK_MAX_LINES, runAskLines } from './storm-ask';
import { OUT_OF_REACH, TWO_LANES, kitchen } from './storm-ask.fixture';

// The built-in hand's engine run (docs/specs/021-event-storming/asks.md "The built-in hand"): each line the model
// answered runs through the edit-operation engine alone, a lane plan as one changeset; what is no suggest line,
// does not parse or is refused is dropped and counted.

const GAP = 'suggest domain-event "Ticket Fired" after=fire-ticket reason="what the pass reports"';
const added = (before: Element[], after: Element[]) =>
  after.filter((el) => !before.some((b) => b.id === el.id));

describe('running the lines of an ask', () => {
  it('takes each suggest line the engine accepts, by the built-in model', () => {
    const tab = kitchen();
    const run = runAskLines(tab, [
      GAP,
      'suggest-context "Pass" fire-ticket plate-dish dish-plated reason="where a dish leaves the kitchen"',
      'suggest-reword order-taken "Order Received" reason="what the waiter says"',
    ]);
    expect(run).toMatchObject({ lines: 3, dropped: 0, planned: false, refusal: null });
    const [suggested, context] = added(tab.elements, run.tab.elements);
    expect(suggested).toMatchObject({ label: 'Ticket Fired', esSuggestion: { by: ASK_BY } });
    expect(isSuggestion(suggested!)).toBe(true);
    expect(candidateContexts([context!])[0]).toMatchObject({
      label: 'Pass',
      esContext: { suggestion: { by: ASK_BY } },
    });
    const reworded = run.tab.elements.find((el) => el.id === 'order-taken')!;
    expect(noteChangesOf(reworded)).toMatchObject([{ words: 'Order Received', by: ASK_BY }]);
  });

  it('lets a line build on the one before it', () => {
    const run = runAskLines(kitchen(), [
      'suggest command "Fire Ticket Now" before=fire-ticket reason="who asks"',
      'suggest actor "Chef" above=fire-ticket-now reason="who fires it"',
    ]);
    expect(run).toMatchObject({ lines: 2, dropped: 0 });
    expect(run.tab.elements.at(-1)).toMatchObject({
      label: 'Chef',
      esSuggestion: { anchorId: 'fire-ticket-now' },
    });
  });

  it('drops what is no line, does not parse, is no suggestion or is refused, and says which', () => {
    const codes: string[] = [];
    const tab = kitchen();
    const run = runAskLines(
      tab,
      [
        7,
        '',
        'suggest domain-event "Unclosed after=fire-ticket',
        'rm cook',
        `${GAP}\n${GAP}`,
        'suggest domain-event "Nowhere" after=no-such-note reason="lost"',
        GAP,
      ],
      { dropped: (code) => codes.push(code) },
    );
    expect(run).toMatchObject({ lines: 7, dropped: 6 });
    expect(codes).toEqual([
      'not_a_line',
      'not_one_line',
      'parse_error',
      'not_a_suggestion',
      'not_one_line',
      'target_not_found',
    ]);
    expect(added(tab.elements, run.tab.elements)).toHaveLength(1);
  });

  it('reads no more lines than a changeset of suggestions holds', () => {
    const codes: string[] = [];
    const lines = Array.from({ length: STORM_ASK_MAX_LINES + 2 }, () => 'rm cook');
    const run = runAskLines(kitchen(), lines, { dropped: (code) => codes.push(code) });
    expect(run).toMatchObject({ lines: STORM_ASK_MAX_LINES + 2, dropped: STORM_ASK_MAX_LINES + 2 });
    expect(codes.filter((code) => code === 'not_a_suggestion')).toHaveLength(STORM_ASK_MAX_LINES);
    expect(codes[0]).toBe('too_many_lines');
  });

  it('settles the lane lines as one plan, after every other line', () => {
    const run = runAskLines(kitchen(), [TWO_LANES[0]!, GAP, TWO_LANES[1]!]);
    // The suggested note is no workshop note yet: the plan holds the seven that are.
    expect(run).toMatchObject({ lines: 3, dropped: 0, planned: true, refusal: null });
    expect(openLanePlan(run.tab.elements)?.esLanePlan).toMatchObject({
      by: ASK_BY,
      reason: 'a lane for each part of the kitchen',
      lanes: [{ name: 'Orders' }, { name: 'Pass' }],
    });
  });

  it('refuses a plan whole, keeps the rest, and says why in the board’s words', () => {
    const codes: string[] = [];
    const tab = kitchen();
    const run = runAskLines(tab, [...OUT_OF_REACH, GAP], { dropped: (code) => codes.push(code) });
    expect(run).toMatchObject({ lines: 5, dropped: 4, planned: false });
    expect(codes).toEqual(['reading_changes']);
    expect(run.refusal).toContain('reading_changes');
    expect(run.refusal).not.toContain('nothing was applied');
    expect(openLanePlan(run.tab.elements)).toBeNull();
    expect(added(tab.elements, run.tab.elements)).toHaveLength(1);
  });
});
