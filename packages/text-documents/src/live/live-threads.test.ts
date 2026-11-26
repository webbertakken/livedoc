// docs/specs/034-text-documents/review.md "How a comment is kept": threads beside the writing in `threads`, anchored
// by positions that follow the text, never stretched by typing at their edges, read as deleted once their text is gone
// and back on undo; comments in the order made, the first one's removal removing the thread.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  LiveThreads,
  REACTION_EMOJI_MAX,
  TEXT_DOCUMENT_REACTIONS_MAX,
  THREADS_MAP,
  type TextDocumentComment,
  type TextDocumentThreadStart,
} from './live-threads';

const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };
const BEN = { key: 'k-ben', name: 'Ben', colour: '#16a34a' };

const comment = (
  id: string,
  at: number,
  author: TextDocumentComment['author'] = ADA,
  text = `said ${id}`,
): TextDocumentComment => ({
  id,
  text,
  at,
  author,
});

/** A doc whose first tab's body is one paragraph reading `text`. */
function written(text = 'quarterly results are in') {
  const doc = new Y.Doc({ gc: false });
  const body = doc.getXmlFragment('body');
  const paragraph = new Y.XmlElement('paragraph');
  const run = new Y.XmlText();
  paragraph.insert(0, [run]);
  body.insert(0, [paragraph]);
  run.insert(0, text);
  return { doc, body, run };
}

const startOn = (
  run: Y.XmlText,
  from: number,
  to: number,
  id = 'th1',
  at = 10,
): TextDocumentThreadStart => ({
  id,
  tab: 't.0',
  ...LiveThreads.anchorFor(run, from, to),
  quote: run.toJSON().slice(from, to),
  comment: comment(`${id}-c1`, at),
});

/** The anchored stretch's text, read back through the positions. */
function anchored(doc: Y.Doc, run: Y.XmlText, threadId: string): string | null {
  const thread = LiveThreads.read(doc).find((t) => t.id === threadId)!;
  const at = LiveThreads.anchor(doc, thread);
  if (!at || at.deleted) return null;
  return run.toJSON().slice(at.start.index, at.end.index);
}

describe('LiveThreads', () => {
  it('begins a thread beside the writing, never in it', () => {
    const { doc, run, body } = written();
    const before = body.toJSON();
    expect(LiveThreads.begin(doc, startOn(run, 0, 9), 'me')).toBe(true);
    expect(body.toJSON()).toBe(before);
    expect(doc.getMap(THREADS_MAP).size).toBe(1);
    const [thread] = LiveThreads.read(doc);
    expect(thread).toMatchObject({
      id: 'th1',
      tab: 't.0',
      quote: 'quarterly',
      resolved: false,
      comments: [{ id: 'th1-c1', text: 'said th1-c1', at: 10, author: ADA }],
    });
    expect(anchored(doc, run, 'th1')).toBe('quarterly');
  });

  it('reads threads by their first comment’s time, then id, the first comment first whatever a reply’s clock says', () => {
    const { doc, run } = written();
    LiveThreads.begin(doc, startOn(run, 10, 17, 'b', 30), 'me');
    LiveThreads.begin(doc, startOn(run, 0, 9, 'a', 30), 'me');
    LiveThreads.begin(doc, startOn(run, 18, 21, 'c', 20), 'me');
    LiveThreads.reply(doc, 'a', comment('a-late', 90, BEN), 'me');
    LiveThreads.reply(doc, 'a', comment('a-early', 40, BEN), 'me');
    const threads = LiveThreads.read(doc);
    expect(threads.map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(threads[1]!.comments.map((c) => c.id)).toEqual(['a-c1', 'a-early', 'a-late']);
    LiveThreads.reply(doc, 'c', comment('c-skewed', 5, BEN), 'me');
    expect(LiveThreads.read(doc)[0]!.comments.map((c) => c.id)).toEqual(['c-c1', 'c-skewed']);
    LiveThreads.remove(doc, 'c', 'c-skewed', 'me');
    expect(LiveThreads.read(doc)[0]!.comments.map((c) => c.id)).toEqual(['c-c1']);
  });

  it('overlaps threads freely', () => {
    const { doc, run } = written();
    LiveThreads.begin(doc, startOn(run, 0, 17, 'wide'), 'me');
    LiveThreads.begin(doc, startOn(run, 10, 21, 'cross'), 'me');
    expect(anchored(doc, run, 'wide')).toBe('quarterly results');
    expect(anchored(doc, run, 'cross')).toBe('results are');
  });

  it('follows the text: typing before the stretch moves it, typing at its edges never stretches it', () => {
    const { doc, run } = written();
    LiveThreads.begin(doc, startOn(run, 10, 17), 'me');
    run.insert(0, 'The ');
    expect(anchored(doc, run, 'th1')).toBe('results');
    run.insert(14, '[');
    run.insert(22, ']');
    expect(run.toJSON()).toBe('The quarterly [results] are in');
    expect(anchored(doc, run, 'th1')).toBe('results');
    run.insert(18, 'XY');
    expect(anchored(doc, run, 'th1')).toBe('resXYults');
  });

  it('reads as deleted once every character is gone, and back with its text on undo', () => {
    const { doc, run, body } = written();
    LiveThreads.begin(doc, startOn(run, 10, 17), 'me');
    const undo = new Y.UndoManager(body, { captureTimeout: 0 });
    run.delete(9, 9);
    const thread = LiveThreads.read(doc)[0]!;
    expect(LiveThreads.anchor(doc, thread)?.deleted).toBe(true);
    expect(thread.quote).toBe('results');
    undo.undo();
    expect(anchored(doc, run, 'th1')).toBe('results');
  });

  it('never reads a point comment (an empty quote) as deleted', () => {
    const { doc, run } = written();
    LiveThreads.begin(doc, startOn(run, 10, 10), 'me');
    const thread = LiveThreads.read(doc)[0]!;
    expect(thread.quote).toBe('');
    expect(LiveThreads.anchor(doc, thread)?.deleted).toBe(false);
  });

  it('edits a comment, keeping its first time and noting the edit’s', () => {
    const { doc, run } = written();
    LiveThreads.begin(doc, startOn(run, 0, 9), 'me');
    expect(LiveThreads.edit(doc, 'th1', 'th1-c1', 'better words', 55, 'me')).toBe(true);
    expect(LiveThreads.read(doc)[0]!.comments[0]).toMatchObject({
      text: 'better words',
      at: 10,
      edited: 55,
    });
  });

  // review.md "Mentions": kept as sent; an edit keeps those whose handle is still in its text.
  it('keeps a comment’s mentions, and an edit replaces or drops them', () => {
    const { doc, run } = written();
    const priya = {
      userId: 'u-priya',
      memberId: 'm-priya',
      name: 'Priya Kaur',
      handle: 'priya-kaur',
    };
    const start = startOn(run, 0, 9);
    LiveThreads.begin(doc, { ...start, comment: { ...start.comment, mentions: [priya] } }, 'me');
    expect(LiveThreads.read(doc)[0]!.comments[0]!.mentions).toEqual([priya]);
    LiveThreads.edit(doc, 'th1', 'th1-c1', 'still @priya-kaur', 55, 'me');
    expect(LiveThreads.read(doc)[0]!.comments[0]!.mentions).toEqual([priya]);
    LiveThreads.edit(doc, 'th1', 'th1-c1', 'nobody', 56, 'me', []);
    expect(LiveThreads.read(doc)[0]!.comments[0]!.mentions).toBeUndefined();
  });

  // review.md "Assigning": the assigning comment keeps its assignee through an edit.
  it('keeps a comment’s assignee, an edit never changing it', () => {
    const { doc, run } = written();
    const priya = { userId: 'u-priya', name: 'Priya Kaur', handle: 'priya-kaur' };
    const start = startOn(run, 0, 9);
    LiveThreads.begin(
      doc,
      { ...start, comment: { ...start.comment, mentions: [priya], assignee: priya } },
      'me',
    );
    LiveThreads.edit(doc, 'th1', 'th1-c1', 'other words', 55, 'me', []);
    expect(LiveThreads.read(doc)[0]!.comments[0]!.assignee).toEqual(priya);
  });

  it('removes a reply alone, and the whole thread with its first comment', () => {
    const { doc, run } = written();
    LiveThreads.begin(doc, startOn(run, 0, 9), 'me');
    LiveThreads.reply(doc, 'th1', comment('r1', 20, BEN), 'me');
    expect(LiveThreads.remove(doc, 'th1', 'r1', 'me')).toBe(true);
    expect(LiveThreads.read(doc)[0]!.comments.map((c) => c.id)).toEqual(['th1-c1']);
    expect(LiveThreads.remove(doc, 'th1', 'th1-c1', 'me')).toBe(true);
    expect(LiveThreads.read(doc)).toEqual([]);
    expect(doc.getMap(THREADS_MAP).size).toBe(0);
  });

  // review.md "Suggestion cards", Replies: a thread tied to a suggestion carries its id.
  it('keeps a thread’s tie to a suggestion, and none where it has none', () => {
    const { doc, run } = written();
    LiveThreads.begin(doc, { ...startOn(run, 0, 9), suggestion: 's1' }, 'me');
    LiveThreads.begin(doc, startOn(run, 10, 17, 'th2', 20), 'me');
    const [tied, plain] = LiveThreads.read(doc);
    expect(tied!.suggestion).toBe('s1');
    expect(plain).not.toHaveProperty('suggestion');
  });

  it('resolves and reopens a thread', () => {
    const { doc, run } = written();
    LiveThreads.begin(doc, startOn(run, 0, 9), 'me');
    LiveThreads.resolve(doc, 'th1', true, 'me');
    expect(LiveThreads.read(doc)[0]!.resolved).toBe(true);
    LiveThreads.resolve(doc, 'th1', false, 'me');
    expect(LiveThreads.read(doc)[0]!.resolved).toBe(false);
  });

  it('adds and takes back a reaction by its reactor’s key, an emoji with none left dropped', () => {
    const { doc, run } = written();
    LiveThreads.begin(doc, startOn(run, 0, 9), 'me');
    LiveThreads.react(doc, 'th1', 'th1-c1', { emoji: '👍', key: 'k-ben', on: true }, 'me');
    LiveThreads.react(doc, 'th1', 'th1-c1', { emoji: '👍', key: 'k-ada', on: true }, 'me');
    LiveThreads.react(doc, 'th1', 'th1-c1', { emoji: '🎉', key: 'k-ada', on: true }, 'me');
    expect(LiveThreads.read(doc)[0]!.comments[0]!.reactions).toEqual({
      '👍': ['k-ada', 'k-ben'],
      '🎉': ['k-ada'],
    });
    LiveThreads.react(doc, 'th1', 'th1-c1', { emoji: '🎉', key: 'k-ada', on: false }, 'me');
    expect(LiveThreads.read(doc)[0]!.comments[0]!.reactions).toEqual({ '👍': ['k-ada', 'k-ben'] });
  });

  // review.md "Reactions": kept one entry per emoji and reactor, so two first reactions at once both stay.
  it('keeps two people’s first reactions made at once', () => {
    const { doc, run } = written();
    LiveThreads.begin(doc, startOn(run, 0, 9), 'me');
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));
    LiveThreads.react(doc, 'th1', 'th1-c1', { emoji: '👍', key: 'k-ada', on: true }, 'me');
    LiveThreads.react(other, 'th1', 'th1-c1', { emoji: '👍', key: 'k-ben', on: true }, 'me');
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(other));
    expect(LiveThreads.read(doc)[0]!.comments[0]!.reactions).toEqual({ '👍': ['k-ada', 'k-ben'] });
  });

  it('refuses an emoji too long, or one more past the most a comment holds', () => {
    const { doc, run } = written();
    LiveThreads.begin(doc, startOn(run, 0, 9), 'me');
    const react = (emoji: string) =>
      LiveThreads.react(doc, 'th1', 'th1-c1', { emoji, key: 'k', on: true }, 'me');
    expect(react('x'.repeat(REACTION_EMOJI_MAX + 1))).toBe(false);
    for (let i = 0; i < TEXT_DOCUMENT_REACTIONS_MAX; i += 1) expect(react(`e${i}`)).toBe(true);
    expect(react('one more')).toBe(false);
    expect(react('e0')).toBe(true);
    expect(Object.keys(LiveThreads.read(doc)[0]!.comments[0]!.reactions!)).toHaveLength(
      TEXT_DOCUMENT_REACTIONS_MAX,
    );
  });

  it('keeps a comment’s reactions given when it is begun or replied (a file’s)', () => {
    const { doc, run } = written();
    LiveThreads.begin(
      doc,
      { ...startOn(run, 0, 9), comment: { ...comment('th1-c1', 1), reactions: { '👍': ['k1'] } } },
      'me',
    );
    LiveThreads.reply(doc, 'th1', { ...comment('r', 2), reactions: { '🎉': ['k2', 'k3'] } }, 'me');
    expect(LiveThreads.read(doc)[0]!.comments.map((c) => c.reactions)).toEqual([
      { '👍': ['k1'] },
      { '🎉': ['k2', 'k3'] },
    ]);
  });

  it('changes nothing for a thread or comment that is not there, and says so', () => {
    const { doc, run } = written();
    LiveThreads.begin(doc, startOn(run, 0, 9), 'me');
    const before = Y.encodeStateVector(doc);
    expect(LiveThreads.reply(doc, 'gone', comment('x', 1), 'me')).toBe(false);
    expect(LiveThreads.edit(doc, 'th1', 'gone', 'x', 1, 'me')).toBe(false);
    expect(LiveThreads.remove(doc, 'gone', 'x', 'me')).toBe(false);
    expect(LiveThreads.resolve(doc, 'gone', true, 'me')).toBe(false);
    expect(LiveThreads.react(doc, 'th1', 'gone', { emoji: '👍', key: 'k', on: true }, 'me')).toBe(
      false,
    );
    expect(LiveThreads.begin(doc, startOn(run, 0, 9), 'me')).toBe(false);
    expect(Y.encodeStateVector(doc)).toEqual(before);
  });

  it('keeps a file’s author as the file names them, with no key', () => {
    const { doc, run } = written();
    const fromFile = { name: 'J. Smith', colour: '#6b7280', fromFile: true as const };
    LiveThreads.begin(doc, { ...startOn(run, 0, 9), comment: comment('f', 1, fromFile) }, 'me');
    expect(LiveThreads.read(doc)[0]!.comments[0]!.author).toEqual(fromFile);
  });

  it('marks each write with its origin, as one transaction', () => {
    const { doc, run } = written();
    const origins: unknown[] = [];
    doc.on('afterTransaction', (t: Y.Transaction) => origins.push(t.origin));
    LiveThreads.begin(doc, startOn(run, 0, 9), 'mine');
    LiveThreads.reply(doc, 'th1', comment('r', 2), 'mine');
    expect(origins).toEqual(['mine', 'mine']);
  });
});
