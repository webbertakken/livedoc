import { describe, expect, it } from 'vitest';
import type { Tab } from '@livedoc/document';
import { ASK_BRIEFS } from '@livedoc/storm-reading';
import { ASK_FAILURES, ASK_UNREACHABLE, askFailure, askModel, askedNotice } from './ask';
import { note, orderFlow } from './change-board.fixture';

// The Ask popover's model (docs/specs/021-event-storming/asks.md "Where an ask starts"): what the scope offers, who
// may answer, and the prompt or why there is none.

const tab = (over: Partial<Tab> = {}): Tab => ({
  id: 'es',
  name: 'Orders',
  kind: 'event-storming',
  elements: orderFlow(),
  ...over,
});
const BOARD = {
  document: 'Shop',
  documentId: 'doc-1',
  link: 'https://docs.test/document/doc-1#t=es',
};
const model = (over: Partial<Parameters<typeof askModel>[0]> = {}) =>
  askModel({
    tab: tab(),
    scope: { type: 'board' },
    topic: null,
    hand: 'cli',
    lanes: null,
    aiEnabled: true,
    thisBrowser: false,
    board: BOARD,
    ...over,
  });

describe('the ask popover’s model', () => {
  it('offers the board its four topics, the first chosen, and Arrange and Reorder', () => {
    const m = model();
    expect(m.topics.map((t) => t.menu)).toEqual([
      'Fill the Gaps',
      'Group into Contexts',
      'Sharpen the Wording',
      'Reorganise into Lanes',
    ]);
    expect(m).toMatchObject({
      topic: 'gaps',
      about: 'About the board',
      arrange: true,
      lanes: null,
    });
  });

  it('keeps the topic a person chose while the scope offers it', () => {
    expect(model({ topic: 'wording' }).topic).toBe('wording');
    expect(model({ topic: 'names' }).topic).toBe('gaps');
  });

  it('says what a selection is about, and offers its topics alone', () => {
    const notes = model({ scope: { type: 'notes', ids: ['place', 'placed'] } });
    expect(notes).toMatchObject({ about: 'About 2 notes', topic: 'gaps', arrange: false });
    expect(model({ scope: { type: 'notes', ids: ['place'] } }).about).toBe('About 1 note');
    const context = model({ scope: { type: 'context', id: 'ordering' } });
    expect(context).toMatchObject({ about: 'About “Ordering”', topic: 'names' });
    const merge = model({ scope: { type: 'contexts', ids: ['ordering', 'fulfilment'] } });
    expect(merge).toMatchObject({ about: 'About 2 contexts', topic: 'merge' });
    expect(merge.topics).toHaveLength(1);
  });

  it('falls back to the board when what was selected has gone', () => {
    const gone = model({ scope: { type: 'context', id: 'deleted' } });
    expect(gone).toMatchObject({ scope: { type: 'board' }, about: 'About the board' });
  });

  it('counts lanes from those in use, held within two and twelve, for a lane plan alone', () => {
    expect(model({ topic: 'lanes' }).lanes).toEqual({ value: 2, min: 2, max: 12 });
    const three = tab({
      elements: [note('a', 'A', 0, 'actor', 0), note('b', 'B', 0, 'command', 1), note('c', 'C', 1)],
    });
    expect(model({ tab: three, topic: 'lanes' }).lanes?.value).toBe(3);
    expect(model({ tab: three, topic: 'lanes', lanes: 5 }).lanes?.value).toBe(5);
    expect(model({ tab: three, topic: 'lanes', lanes: 40 }).lanes?.value).toBe(12);
    expect(model({ tab: three, topic: 'lanes', lanes: 0 }).lanes?.value).toBe(2);
  });

  it('offers three hands, the CLI first, and two on a deployment with no model', () => {
    expect(model().hands).toEqual(['cli', 'mcp', 'built-in']);
    const none = model({ aiEnabled: false, hand: 'built-in' });
    expect(none.hands).toEqual(['cli', 'mcp']);
    expect(none.hand).toBe('cli');
    expect(model({ hand: 'built-in' }).hand).toBe('built-in');
  });

  it('writes the prompt of the hand, with the board, the ask and the brief', () => {
    const cli = model({ topic: 'lanes', lanes: 4 });
    expect(cli.prompt).toContain('Board: "Shop", tab "Orders"');
    expect(cli.prompt).toContain(BOARD.link);
    expect(cli.prompt).toContain('Reorganise this board into 4 lanes.');
    expect(cli.prompt).toContain(ASK_BRIEFS.lanes);
    expect(cli.prompt).toContain('livedoc storm read doc-1 --tab es');
    expect(model({ hand: 'mcp' }).prompt).toContain('read_event_storming');
    expect(model({ hand: 'built-in' })).toMatchObject({ prompt: null, unreachable: null });
  });

  it('says a board in This Browser is out of an agent’s reach, and still asks the built-in model', () => {
    const cli = model({ thisBrowser: true });
    expect(cli).toMatchObject({ prompt: null, unreachable: ASK_UNREACHABLE });
    expect(ASK_UNREACHABLE).toBe(
      'This board is saved only in this browser, so an agent cannot reach it. Use the built-in model, or save it to your account.',
    );
    expect(model({ thisBrowser: true, hand: 'built-in' }).unreachable).toBeNull();
  });

  it('reads the About and counts what was declined', () => {
    const m = model({
      tab: tab({
        esAbout: 'A shop that ships books.',
        esDeclined: [
          { type: 'note', words: 'Order lost', kind: 'domain-event', about: ['placed'] },
        ],
      }),
    });
    expect(m).toMatchObject({ aboutText: 'A shop that ships books.', declined: 1 });
    expect(model()).toMatchObject({ aboutText: '', declined: 0 });
  });
});

describe('what an ask ends on', () => {
  it('says why it failed and what to do', () => {
    expect(askFailure('sign_in_required')).toBe(ASK_FAILURES.sign_in_required);
    expect(askFailure('rate_limited')).toBe('Too many asks just now. Wait a minute and ask again.');
    expect(askFailure('board_too_large')).toContain('too large');
    expect(askFailure('ai_failed')).toBe(
      'The model did not answer. Copy the prompt for your agent instead.',
    );
    expect(askFailure('anything_else')).toBe(ASK_FAILURES.ai_failed);
  });

  it('says how many suggestions were added, or that there was nothing', () => {
    expect(askedNotice(3)).toBe('3 suggestions added');
    expect(askedNotice(1)).toBe('1 suggestion added');
    expect(askedNotice(0)).toBe('Nothing to suggest');
    expect(askedNotice(1, true)).toBe(
      'The model’s plan would change what the board says. This is the board’s own fold.',
    );
    expect(askedNotice(0, 'fits', 4)).toBe('The board already fits 4 lanes.');
    expect(askedNotice(0, 'no_arrangement', 2)).toBe(
      'No arrangement in 2 lanes keeps what the board says. Try more lanes.',
    );
  });
});
