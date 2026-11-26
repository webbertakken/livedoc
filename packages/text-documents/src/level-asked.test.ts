// docs/specs/034-text-documents/review.md "How a comment is kept" (the room judges a Participant's update): only
// `threads`, and in it only the sender's own comments added, edited or removed, threads begun with one, resolved or
// reopened, and the sender's own reactions; anything else asks for Editing. An update standing on changes the stored
// state lacks cannot be judged.
import { describe, expect, it } from 'vitest';
import { MENTIONS_MAX } from '@livedoc/document';
import * as Y from 'yjs';
import { textDocumentLevelAsked } from './level-asked';
import {
  LiveThreads,
  TEXT_DOCUMENT_COMMENT_TEXT_MAX,
  TEXT_DOCUMENT_REACTIONS_MAX,
  TEXT_DOCUMENT_THREAD_COMMENTS_MAX,
  TEXT_DOCUMENT_THREADS_MAX,
  THREADS_MAP,
  type TextDocumentComment,
} from './live/live-threads';

const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };
const BEN = { key: 'k-ben', name: 'Ben', colour: '#16a34a' };

const comment = (id: string, author = ADA, text = 'a thought'): TextDocumentComment => ({
  id,
  text,
  at: 1,
  author,
});

/** The stored state: one paragraph, and a thread by Ben on its first word. */
function stored() {
  const doc = new Y.Doc({ gc: false });
  const paragraph = new Y.XmlElement('paragraph');
  const run = new Y.XmlText();
  paragraph.insert(0, [run]);
  doc.getXmlFragment('body').insert(0, [paragraph]);
  run.insert(0, 'quarterly results');
  LiveThreads.begin(
    doc,
    {
      id: 'ben',
      tab: 't.0',
      ...LiveThreads.anchorFor(run, 0, 9),
      quote: 'quarterly',
      comment: comment('b1', BEN),
    },
    'seed',
  );
  return { doc, run, updates: [Y.encodeStateAsUpdate(doc)] };
}

/** What `change` does to a replica of the stored state, as one update. */
function changeBy(change: (doc: Y.Doc, run: Y.XmlText) => void) {
  const base = stored();
  const replica = new Y.Doc({ gc: false });
  Y.applyUpdate(replica, base.updates[0]!);
  const before = Y.encodeStateVector(replica);
  const run = (replica.getXmlFragment('body').get(0) as Y.XmlElement).get(0) as Y.XmlText;
  change(replica, run);
  return { stored: base.updates, update: Y.encodeStateAsUpdate(replica, before) };
}

const asked = (change: (doc: Y.Doc, run: Y.XmlText) => void, key: string | null = 'k-ada') => {
  const { stored: s, update } = changeBy(change);
  return textDocumentLevelAsked(s, update, key);
};

const begin = (doc: Y.Doc, run: Y.XmlText, first = comment('a1'), id = 'ada') =>
  LiveThreads.begin(
    doc,
    { id, tab: 't.0', ...LiveThreads.anchorFor(run, 10, 17), quote: 'results', comment: first },
    'me',
  );

describe('textDocumentLevelAsked', () => {
  it('lets a Participant begin a thread, reply, edit and remove their own, resolve, reopen and react', () => {
    expect(asked((doc, run) => begin(doc, run))).toBe('participate');
    expect(asked((doc) => LiveThreads.reply(doc, 'ben', comment('a2'), 'me'))).toBe('participate');
    expect(asked((doc) => LiveThreads.resolve(doc, 'ben', true, 'me'))).toBe('participate');
    expect(
      asked((doc) => {
        LiveThreads.resolve(doc, 'ben', true, 'me');
        LiveThreads.resolve(doc, 'ben', false, 'me');
      }),
    ).toBe('participate');
    expect(
      asked((doc) =>
        LiveThreads.react(doc, 'ben', 'b1', { emoji: '👍', key: 'k-ada', on: true }, 'me'),
      ),
    ).toBe('participate');
    const own = (then: (doc: Y.Doc) => void) =>
      asked((doc) => {
        LiveThreads.reply(doc, 'ben', comment('a2'), 'me');
        then(doc);
      });
    expect(own((doc) => LiveThreads.edit(doc, 'ben', 'a2', 'better', 2, 'me'))).toBe('participate');
    expect(own((doc) => LiveThreads.remove(doc, 'ben', 'a2', 'me'))).toBe('participate');
  });

  it('judges a Participant’s change to what is already stored by its author', () => {
    const base = stored();
    LiveThreads.reply(base.doc, 'ben', comment('a2'), 'me');
    const s = [Y.encodeStateAsUpdate(base.doc)];
    const judged = (change: (doc: Y.Doc) => void, key = 'k-ada') => {
      const replica = new Y.Doc({ gc: false });
      Y.applyUpdate(replica, s[0]!);
      const before = Y.encodeStateVector(replica);
      change(replica);
      return textDocumentLevelAsked(s, Y.encodeStateAsUpdate(replica, before), key);
    };
    expect(judged((doc) => LiveThreads.edit(doc, 'ben', 'a2', 'better', 2, 'me'))).toBe(
      'participate',
    );
    expect(judged((doc) => LiveThreads.remove(doc, 'ben', 'a2', 'me'))).toBe('participate');
    expect(judged((doc) => LiveThreads.edit(doc, 'ben', 'a2', 'better', 2, 'me'), 'k-ben')).toBe(
      'edit',
    );
    expect(judged((doc) => LiveThreads.remove(doc, 'ben', 'a2', 'me'), 'k-ben')).toBe('edit');
  });

  it('asks for Editing for any change to the writing', () => {
    expect(asked((_doc, run) => run.insert(0, 'The '))).toBe('edit');
    expect(
      asked((doc, run) => {
        begin(doc, run);
        run.format(0, 9, { bold: true });
      }),
    ).toBe('edit');
    expect(asked((doc) => doc.getMap('document').set('pageless', true))).toBe('edit');
  });

  it('asks for Editing for a comment in another’s name, or another’s comment changed', () => {
    expect(asked((doc, run) => begin(doc, run, comment('a1', BEN)))).toBe('edit');
    expect(asked((doc) => LiveThreads.reply(doc, 'ben', comment('a2', BEN), 'me'))).toBe('edit');
    expect(asked((doc) => LiveThreads.edit(doc, 'ben', 'b1', 'not mine', 2, 'me'))).toBe('edit');
    expect(asked((doc) => LiveThreads.remove(doc, 'ben', 'b1', 'me'))).toBe('edit');
    expect(
      asked((doc) =>
        LiveThreads.react(doc, 'ben', 'b1', { emoji: '👍', key: 'k-ben', on: true }, 'me'),
      ),
    ).toBe('edit');
    expect(
      asked((doc, run) =>
        begin(doc, run, {
          ...comment('a1'),
          author: { name: 'File', colour: '#000', fromFile: true },
        }),
      ),
    ).toBe('edit');
  });

  it('asks for Editing for a thread’s anchor, quote, tab or a comment’s author or time changed', () => {
    const thread = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>(THREADS_MAP).get('ben')!;
    const first = (doc: Y.Doc) => (thread(doc).get('comments') as Y.Map<Y.Map<unknown>>).get('b1')!;
    expect(
      asked((doc, run) => thread(doc).set('start', LiveThreads.anchorFor(run, 1, 2).start)),
    ).toBe('edit');
    expect(asked((doc) => thread(doc).set('quote', 'other'))).toBe('edit');
    expect(asked((doc) => thread(doc).set('tab', 't.x'))).toBe('edit');
    expect(asked((doc) => first(doc).set('author', ADA))).toBe('edit');
    expect(asked((doc) => first(doc).set('at', 99))).toBe('edit');
    expect(
      asked((doc) => {
        LiveThreads.reply(doc, 'ben', comment('a2'), 'me');
        thread(doc).set('first', 'a2');
      }),
    ).toBe('edit');
  });

  it('asks for Editing for reactions past the most, an emoji too long, or a new comment carrying any', () => {
    const reactionsOf = (doc: Y.Doc) => {
      const thread = doc.getMap<Y.Map<unknown>>(THREADS_MAP).get('ben')!;
      const comments = thread.get('comments') as Y.Map<Y.Map<unknown>>;
      return comments.get('b1')!.get('reactions') as Y.Map<boolean>;
    };
    expect(
      asked((doc) => {
        for (let i = 0; i <= TEXT_DOCUMENT_REACTIONS_MAX; i += 1)
          reactionsOf(doc).set(`e${i}\nk-ada`, true);
      }),
    ).toBe('edit');
    expect(asked((doc) => reactionsOf(doc).set(`${'x'.repeat(17)}\nk-ada`, true))).toBe('edit');
    expect(asked((doc) => reactionsOf(doc).set('🎉\nk-ada', true))).toBe('participate');
    expect(
      asked((doc) =>
        LiveThreads.reply(doc, 'ben', { ...comment('a2'), reactions: { '👍': ['k-ada'] } }, 'me'),
      ),
    ).toBe('edit');
  });

  // review.md "Mentions": the room takes a Participant's own comment with mentions in the shared shape and limits.
  it('lets a Participant mention, and asks for Editing for mentions past the most or malformed', () => {
    const priya = {
      userId: 'u-priya',
      memberId: 'm-priya',
      name: 'Priya Kaur',
      handle: 'priya-kaur',
    };
    const mentioning = (mentions: unknown[]) =>
      asked((doc) => LiveThreads.reply(doc, 'ben', { ...comment('a2'), mentions }, 'me'));
    expect(mentioning([priya])).toBe('participate');
    expect(mentioning([{ ...priya, userId: null }])).toBe('participate');
    expect(mentioning(Array.from({ length: MENTIONS_MAX + 1 }, () => priya))).toBe('edit');
    expect(mentioning([{ ...priya, name: 7 }])).toBe('edit');
    expect(mentioning([{ ...priya, handle: 'x'.repeat(101) }])).toBe('edit');
    expect(mentioning(['priya'])).toBe('edit');
    expect(
      asked((doc) => {
        LiveThreads.reply(doc, 'ben', comment('a2'), 'me');
        LiveThreads.edit(doc, 'ben', 'a2', '@priya-kaur', 2, 'me', [priya]);
      }),
    ).toBe('participate');
  });

  // review.md "Assigning": a Participant assigns only someone their comment mentions.
  it('lets a Participant assign whom their comment mentions, and no one else', () => {
    const priya = {
      userId: 'u-priya',
      memberId: 'm-priya',
      name: 'Priya Kaur',
      handle: 'priya-kaur',
    };
    const assigning = (assignee: unknown, mentions: unknown[] = [priya]) =>
      asked((doc) => LiveThreads.reply(doc, 'ben', { ...comment('a2'), mentions, assignee }, 'me'));
    expect(assigning(priya)).toBe('participate');
    expect(assigning({ ...priya, userId: 'u-else' })).toBe('edit');
    expect(assigning(priya, [])).toBe('edit');
    expect(assigning('priya')).toBe('edit');
  });

  it('asks for Editing for a thread begun resolved or with no anchor', () => {
    expect(
      asked((doc, run) => {
        begin(doc, run);
        doc.getMap<Y.Map<unknown>>(THREADS_MAP).get('ada')!.set('resolved', true);
      }),
    ).toBe('edit');
    expect(
      asked((doc) =>
        LiveThreads.begin(
          doc,
          {
            id: 'x',
            tab: 't.0',
            start: new Uint8Array(),
            end: new Uint8Array(),
            quote: '',
            comment: comment('x1'),
          },
          'me',
        ),
      ),
    ).toBe('edit');
  });

  it('asks for Editing past a limit', () => {
    const long = 'x'.repeat(TEXT_DOCUMENT_COMMENT_TEXT_MAX + 1);
    expect(asked((doc) => LiveThreads.reply(doc, 'ben', comment('a2', ADA, long), 'me'))).toBe(
      'edit',
    );
    expect(
      asked((doc) => {
        for (let i = 0; i < TEXT_DOCUMENT_THREAD_COMMENTS_MAX; i += 1)
          LiveThreads.reply(doc, 'ben', comment(`a${i}`), 'me');
      }),
    ).toBe('edit');
    expect(
      asked((doc, run) => {
        for (let i = 0; i < TEXT_DOCUMENT_THREADS_MAX; i += 1)
          begin(doc, run, comment(`c${i}`), `t${i}`);
      }),
    ).toBe('edit');
  });

  it('asks for Editing from a session with no key', () => {
    expect(asked((doc, run) => begin(doc, run), null)).toBe('edit');
  });

  it('cannot judge an update standing on changes the stored state lacks', () => {
    const base = stored();
    const replica = new Y.Doc({ gc: false });
    Y.applyUpdate(replica, base.updates[0]!);
    LiveThreads.reply(replica, 'ben', comment('a2'), 'me');
    const missing = Y.encodeStateVector(replica);
    LiveThreads.reply(replica, 'ben', comment('a3'), 'me');
    const later = Y.encodeStateAsUpdate(replica, missing);
    expect(textDocumentLevelAsked(base.updates, later, 'k-ada')).toBe('unreadable');
    expect(textDocumentLevelAsked(base.updates, new Uint8Array([1, 2, 3]), 'k-ada')).toBe(
      'unreadable',
    );
  });
});
