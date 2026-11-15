// docs/specs/021-event-storming/asks.md "The prompt", "What a model is told" and "The built-in hand".
import { describe, expect, it } from 'vitest';
import { newContextElement, type Element, type StickyElement, type Tab } from '@livedoc/document';
import { note } from '../testing';
import { ASK_BRIEFS, ASK_DATA_RULE, ASK_RULE } from './briefs';
import { STORM_ASK_TOPICS } from './catalogue';
import { ASK_LINES } from './lines';
import { ASK_SCOPE_SHOWN, askMessages, askPrompt, askSentence, type AskBoard } from './prompt';

const stickies = () =>
  [
    note({ id: 'place', kind: 'command', col: 0, words: 'Place Order' }),
    note({ id: 'placed', kind: 'domain-event', col: 1, words: 'Order Placed' }),
    note({ id: 'pay', kind: 'command', col: 2, words: 'Take Payment' }),
    note({ id: 'paid', kind: 'domain-event', col: 3, words: '  ' }),
  ] as StickyElement[];

function shop(): Tab {
  const [place, placed, pay, paid] = stickies();
  const elements: Element[] = [
    place!,
    placed!,
    pay!,
    paid!,
    newContextElement({ id: 'ordering', name: 'Ordering', notes: [place!, placed!] }),
    newContextElement({ id: 'payments', name: 'Payments', notes: [pay!, paid!] }),
  ];
  return {
    id: 'tab-1',
    name: 'Order flow',
    kind: 'event-storming',
    elements,
    esAbout: 'A corner shop that sells online.',
  };
}

const BOARD: AskBoard = {
  document: 'Shop',
  tab: 'Order flow',
  link: 'https://docs.nu/document/doc-1?tab=tab-1',
  documentId: 'doc-1',
  tabId: 'tab-1',
};

const board = { type: 'board' } as const;

describe('an ask in one sentence', () => {
  const { elements } = shop();

  it('says what is asked of the board', () => {
    expect(askSentence('gaps', board, elements)).toBe('Suggest the notes this board is missing.');
    expect(askSentence('contexts', board, elements)).toBe(
      'Group the notes of this board into candidate contexts.',
    );
    expect(askSentence('wording', board, elements)).toBe(
      'Sharpen the wording of the notes on this board.',
    );
    expect(askSentence('lanes', board, elements, 4)).toBe('Reorganise this board into 4 lanes.');
  });

  it('names the selected notes by ref and words, a blank one by its ref alone', () => {
    expect(askSentence('gaps', { type: 'notes', ids: ['place', 'placed', 'paid'] }, elements)).toBe(
      'Suggest the notes missing round place "Place Order", placed "Order Placed" and paid.',
    );
    expect(askSentence('wording', { type: 'notes', ids: ['pay'] }, elements)).toBe(
      'Sharpen the wording of pay "Take Payment".',
    );
  });

  it('names a context, and several to be merged', () => {
    expect(askSentence('names', { type: 'context', id: 'ordering' }, elements)).toBe(
      'Suggest other names for the candidate context ordering "Ordering".',
    );
    expect(askSentence('wording', { type: 'context', id: 'ordering' }, elements)).toBe(
      'Sharpen the wording of the notes in the candidate context ordering "Ordering".',
    );
    expect(
      askSentence('merge', { type: 'contexts', ids: ['ordering', 'payments'] }, elements),
    ).toBe(
      'Suggest one name for the candidate contexts ordering "Ordering" and payments "Payments" merged into one.',
    );
  });

  it('lists only so many, counts the rest, and passes over what is gone', () => {
    const many = Array.from({ length: ASK_SCOPE_SHOWN + 3 }, (_, i) =>
      note({ id: `n${i}`, kind: 'domain-event', col: i, words: `Fact ${i}` }),
    );
    const said = askSentence(
      'wording',
      { type: 'notes', ids: ['gone', ...many.map((n) => n.id)] },
      many,
    );
    expect(said).toContain(`n${ASK_SCOPE_SHOWN - 1} "Fact ${ASK_SCOPE_SHOWN - 1}" and 3 more.`);
    expect(said).not.toContain('gone');
  });
});

describe('the prompt a person copies', () => {
  it('holds the board, the ask, the brief, the way in and the rule, in that order', () => {
    const prompt = askPrompt({
      topic: 'gaps',
      scope: board,
      hand: 'cli',
      board: BOARD,
      elements: shop().elements,
    });
    const parts = [
      'Board: "Shop", tab "Order flow"',
      BOARD.link,
      'Suggest the notes this board is missing.',
      ASK_BRIEFS.gaps,
      ASK_DATA_RULE,
      'livedoc guide storm',
      'livedoc storm read doc-1 --tab tab-1',
      'livedoc storm suggest doc-1 --tab tab-1 -f -',
      ASK_RULE,
    ];
    const places = parts.map((part) => prompt.indexOf(part));
    expect(places.every((at) => at >= 0)).toBe(true);
    expect(places).toEqual([...places].sort((a, b) => a - b));
    expect(prompt.endsWith(ASK_RULE)).toBe(true);
  });

  it('points the CLI at the guide of its topic', () => {
    const guide = (topic: (typeof STORM_ASK_TOPICS)[number]) =>
      askPrompt({ topic, scope: board, hand: 'cli', board: BOARD, elements: [] });
    expect(guide('contexts')).not.toContain('livedoc guide storm-');
    expect(guide('wording')).toContain('livedoc guide storm-changes');
    expect(guide('lanes')).toContain('livedoc guide storm-lanes');
  });

  it('points the MCP at its tools, with the board filled in', () => {
    const prompt = askPrompt({
      topic: 'lanes',
      scope: board,
      hand: 'mcp',
      lanes: 3,
      board: BOARD,
      elements: shop().elements,
    });
    expect(prompt).toContain('Reorganise this board into 3 lanes.');
    expect(prompt).toContain('read_event_storming');
    expect(prompt).toContain('suggest_notes');
    expect(prompt).toContain('documentId "doc-1"');
    expect(prompt).toContain('tabId "tab-1"');
    expect(prompt).not.toContain('livedoc storm');
  });

  it('is the same words for every topic’s brief as the built-in model is told', () => {
    for (const topic of STORM_ASK_TOPICS) {
      const [system] = askMessages({ topic, scope: board, tab: shop() });
      expect(system!.content).toContain(ASK_BRIEFS[topic]);
    }
  });
});

describe('what the built-in model is sent', () => {
  it('is told the brief, that notes are data, its lines and how to answer; then the board and the ask', () => {
    const [system, user, ...rest] = askMessages({
      topic: 'names',
      scope: { type: 'context', id: 'ordering' },
      tab: shop(),
    });
    expect(rest).toEqual([]);
    expect(system!.role).toBe('system');
    expect(system!.content).toContain(ASK_DATA_RULE);
    expect(system!.content).toContain(ASK_LINES.names);
    expect(system!.content).toContain('{"lines": [');
    expect(user!.role).toBe('user');
    // The reading, with the room's own knowledge, then the ask.
    expect(user!.content).toContain('about');
    expect(user!.content).toContain('A corner shop that sells online.');
    expect(user!.content).toContain('place "Place Order"');
    expect(
      user!.content
        .trimEnd()
        .endsWith('Suggest other names for the candidate context ordering "Ordering".'),
    ).toBe(true);
  });

  it('is told why its last answer was refused, when it is asked again', () => {
    const messages = askMessages({
      topic: 'lanes',
      scope: board,
      lanes: 2,
      tab: shop(),
      refused: {
        lines: ['suggest-lane "All" lanes=1'],
        why: 'lanes_out_of_range: fewer than 2 lanes',
      },
    });
    expect(messages).toHaveLength(4);
    expect(messages[2]).toEqual({
      role: 'assistant',
      content: '{"lines":["suggest-lane \\"All\\" lanes=1"]}',
    });
    expect(messages[3]!.role).toBe('user');
    expect(messages[3]!.content).toContain('lanes_out_of_range: fewer than 2 lanes');
  });
});

describe('the briefs', () => {
  it('hold what things mean, never the steps to take', () => {
    for (const topic of STORM_ASK_TOPICS) {
      const brief = ASK_BRIEFS[topic];
      expect(brief, topic).not.toMatch(/^\s*(\d+[.)]|step\b|first\b|then\b|next\b|finally\b)/im);
      expect(brief.length, topic).toBeLessThanOrEqual(900);
    }
  });
});
