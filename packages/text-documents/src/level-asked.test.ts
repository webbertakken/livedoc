// docs/specs/034-text-documents/review.md "How a comment is kept" (the room judges a Participant's update): only
// `threads`, and in it only the sender's own comments added, edited or removed, threads begun with one, resolved or
// reopened, and the sender's own reactions; anything else asks for Editing. An update standing on changes the stored
// state lacks cannot be judged.
import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES } from '@livedoc/api-schema';
import { MENTIONS_MAX } from '@livedoc/document';
import * as Y from 'yjs';
import { textDocumentLevelAsked } from './level-asked';
import { TEXT_DOCUMENT_SUGGESTIONS_MAX } from './live/live-suggestions';
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

  // review.md "Suggestion cards", Replies: the tie never changes after the thread begins.
  it('lets a Participant begin and reply on a thread tied to a suggestion, never move the tie', () => {
    const tied = (doc: Y.Doc, run: Y.XmlText, suggestion = 's1') =>
      LiveThreads.begin(
        doc,
        {
          id: 'tied',
          tab: 't.0',
          ...LiveThreads.anchorFor(run, 10, 17),
          quote: 'Add: “results”',
          comment: comment('a1'),
          suggestion,
        },
        'me',
      );
    expect(asked((doc, run) => tied(doc, run))).toBe('participate');
    expect(asked((doc, run) => tied(doc, run, 'x'.repeat(65)))).toBe('edit');
    const thread = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>(THREADS_MAP).get('ben')!;
    expect(asked((doc) => thread(doc).set('suggestion', 's9'))).toBe('edit');
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

// docs/specs/034-text-documents/review.md "How a suggestion is kept": a Participant's update to the writing is theirs
// when the writing reads the same with the sender's own suggestions rejected, before and after.
describe('textDocumentLevelAsked on suggestions', () => {
  const mark = (id: string, author = ADA) => ({ id, at: 5, author });

  /** A stored body of two paragraphs, `quarterly results` and `are in`, the second carrying Ben's suggestions. */
  function askedOn(
    change: (doc: Y.Doc, first: Y.XmlText, second: Y.XmlText) => void,
    key: string | null = ADA.key,
    media: Record<string, unknown> = {},
  ) {
    const doc = new Y.Doc({ gc: false });
    const body = doc.getXmlFragment('body');
    const runs = ['quarterly results', 'are in'].map((text) => {
      const paragraph = new Y.XmlElement('paragraph');
      const run = new Y.XmlText();
      paragraph.insert(0, [run]);
      body.push([paragraph]);
      run.insert(0, text);
      return run;
    });
    runs[1]!.format(0, 3, { insertion: mark('ben-1', BEN) });
    for (const [k, v] of Object.entries(media)) doc.getMap('media').set(k, v);
    const stored = [Y.encodeStateAsUpdate(doc)];
    const replica = new Y.Doc({ gc: false });
    Y.applyUpdate(replica, stored[0]!);
    const vector = Y.encodeStateVector(replica);
    const paragraphs = replica.getXmlFragment('body').toArray() as Y.XmlElement[];
    change(replica, paragraphs[0]!.get(0) as Y.XmlText, paragraphs[1]!.get(0) as Y.XmlText);
    return textDocumentLevelAsked(stored, Y.encodeStateAsUpdate(replica, vector), key);
  }

  it('lets a Participant suggest an insertion, a deletion and a format of their own', () => {
    expect(askedOn((_, run) => run.insert(10, 'final ', { insertion: mark('a1') }))).toBe(
      'participate',
    );
    expect(askedOn((_, run) => run.format(0, 9, { deletion: mark('a1') }))).toBe('participate');
    expect(
      askedOn((_, run) =>
        run.format(0, 9, {
          bold: { value: true },
          format_change: { ...mark('a1'), before: { bold: null } },
        }),
      ),
    ).toBe('participate');
  });

  it('lets a Participant suggest a paragraph break, a join and a paragraph format of their own', () => {
    expect(
      askedOn((doc, run) => {
        doc.transact(() => {
          run.delete(9, 8);
          const paragraph = new Y.XmlElement('paragraph');
          paragraph.setAttribute('insertion', mark('a1') as unknown as string);
          const text = new Y.XmlText();
          paragraph.insert(0, [text]);
          doc.getXmlFragment('body').insert(1, [paragraph]);
          text.insert(0, ' results');
        });
      }),
    ).toBe('participate');
    expect(
      askedOn((doc) => {
        (doc.getXmlFragment('body').get(1) as Y.XmlElement).setAttribute(
          'deletion',
          mark('a1') as unknown as string,
        );
      }),
    ).toBe('participate');
    expect(
      askedOn((doc) => {
        const paragraph = doc.getXmlFragment('body').get(0) as Y.XmlElement;
        doc.transact(() => {
          paragraph.setAttribute('style', 'Title');
          paragraph.setAttribute('formatChange', {
            ...mark('a1'),
            before: { style: null, props: null, list: null },
          } as unknown as string);
        });
      }),
    ).toBe('participate');
  });

  it('lets a Participant suggest a horizontal line at the very start, and an equation of their own', () => {
    expect(
      askedOn((doc) => {
        const line = new Y.XmlElement('paragraph');
        line.setAttribute('insertion', mark('a1') as unknown as string);
        line.setAttribute('props', { borders: { bottom: { width: 1 } } } as unknown as string);
        doc.getXmlFragment('body').insert(0, [line]);
      }),
    ).toBe('participate');
    expect(
      askedOn((doc) => {
        const equation = new Y.XmlElement('equation');
        equation.setAttribute('math', [] as unknown as string);
        equation.setAttribute('insertion', mark('a1') as unknown as string);
        (doc.getXmlFragment('body').get(0) as Y.XmlElement).insert(1, [equation]);
      }),
    ).toBe('participate');
    expect(
      askedOn((doc) => {
        const line = new Y.XmlElement('paragraph');
        line.setAttribute('insertion', mark('b9', BEN) as unknown as string);
        doc.getXmlFragment('body').insert(0, [line]);
      }),
    ).toBe('edit');
  });

  describe('a picture’s media', () => {
    const PNG = { mediaType: 'image/png', image: 'img-1' };
    /** A picture keyed `key` in the first paragraph, carrying `insertion` when given, its media written with it. */
    const placed =
      (key: string, insertion: unknown, media: Record<string, unknown> | null = PNG) =>
      (doc: Y.Doc) =>
        doc.transact(() => {
          if (media) doc.getMap('media').set(key, media);
          const picture = new Y.XmlElement('picture');
          picture.setAttribute('media', key);
          if (insertion) picture.setAttribute('insertion', insertion as string);
          (doc.getXmlFragment('body').get(0) as Y.XmlElement).insert(1, [picture]);
        });

    it('lets a Participant put in their own suggested picture with its media, in one update', () => {
      expect(askedOn(placed('k1', mark('a1')))).toBe('participate');
      expect(
        askedOn(placed('k1', mark('a1'), { mediaType: 'image/png', bytes: new Uint8Array(8) })),
      ).toBe('participate');
    });

    it('asks for Editing for media no own suggested picture names, or a picture of no suggestion', () => {
      expect(askedOn((doc) => doc.getMap('media').set('k9', PNG))).toBe('edit');
      expect(askedOn(placed('k1', null))).toBe('edit');
      expect(askedOn(placed('k1', mark('b1', BEN)))).toBe('edit');
    });

    it('asks for Editing to change held media, or for media that is malformed or past the upload cap', () => {
      expect(
        askedOn(
          (doc) => {
            placed('k1', mark('a1'))(doc);
            doc.getMap('media').set('held', { mediaType: 'image/png', image: 'swapped' });
          },
          ADA.key,
          { held: PNG },
        ),
      ).toBe('edit');
      expect(askedOn(placed('k1', mark('a1'), { mediaType: 'text/html', image: 'x' }))).toBe(
        'edit',
      );
      expect(
        askedOn(
          placed('k1', mark('a1'), {
            mediaType: 'image/png',
            bytes: new Uint8Array(MAX_IMAGE_BYTES + 1),
          }),
        ),
      ).toBe('edit');
    });
  });

  // review.md "Whole blocks", "Inside a suggested block": a whole table is a Participant's own suggestion, its writing
  // plainly part of it; anyone else's writing in it is theirs to suggest, never plain (director, 2026-11-26).
  const tableOf = (insertion?: unknown) => {
    const table = new Y.XmlElement('table');
    if (insertion) table.setAttribute('insertion', insertion as string);
    const row = new Y.XmlElement('table_row');
    const cell = new Y.XmlElement('table_cell');
    const paragraph = new Y.XmlElement('paragraph');
    const run = new Y.XmlText();
    paragraph.insert(0, [run]);
    cell.insert(0, [paragraph]);
    row.insert(0, [cell]);
    table.insert(0, [row]);
    return { table, run };
  };
  /** The stored body `before`, then Ben's suggested table holding `in`; `change` given its cell's run. */
  function askedInBensTable(change: (doc: Y.Doc, cell: Y.XmlText) => void) {
    const doc = new Y.Doc({ gc: false });
    const body = doc.getXmlFragment('body');
    const before = new Y.XmlElement('paragraph');
    before.insert(0, [new Y.XmlText('before')]);
    const { table, run } = tableOf(mark('ben-t', BEN));
    body.insert(0, [before, table]);
    run.insert(0, 'in');
    const stored = [Y.encodeStateAsUpdate(doc)];
    const replica = new Y.Doc({ gc: false });
    Y.applyUpdate(replica, stored[0]!);
    const vector = Y.encodeStateVector(replica);
    const cell = (
      (
        ((replica.getXmlFragment('body').get(1) as Y.XmlElement).get(0) as Y.XmlElement).get(
          0,
        ) as Y.XmlElement
      ).get(0) as Y.XmlElement
    ).get(0) as Y.XmlText;
    change(replica, cell);
    return textDocumentLevelAsked(stored, Y.encodeStateAsUpdate(replica, vector), ADA.key);
  }

  it('lets a Participant suggest a whole table and write in it plainly, part of it', () => {
    expect(
      askedOn((doc) => {
        const { table, run } = tableOf(mark('a1'));
        doc.getXmlFragment('body').insert(1, [table]);
        run.insert(0, 'plain in my own table');
      }),
    ).toBe('participate');
  });

  it('asks for Editing to write plainly in another’s suggested table, never to suggest there', () => {
    expect(askedInBensTable((_, cell) => cell.insert(2, ' mine'))).toBe('edit');
    expect(askedInBensTable((_, cell) => cell.insert(2, ' mine', { insertion: mark('a1') }))).toBe(
      'participate',
    );
  });

  // review.md "How a suggestion is kept": a table's row and cell carry an insertion or a deletion whole, a Participant's
  // own read away with their suggestions rejected.
  /** The stored body: a plain table of two rows; `change` given the replica's table. */
  function askedInPlainTable(change: (table: Y.XmlElement) => void) {
    const doc = new Y.Doc({ gc: false });
    const { table } = tableOf();
    doc.getXmlFragment('body').insert(0, [table]);
    table.insert(1, [(table.get(0) as Y.XmlElement).clone()]);
    const stored = [Y.encodeStateAsUpdate(doc)];
    const replica = new Y.Doc({ gc: false });
    Y.applyUpdate(replica, stored[0]!);
    const vector = Y.encodeStateVector(replica);
    change(replica.getXmlFragment('body').get(0) as Y.XmlElement);
    return textDocumentLevelAsked(stored, Y.encodeStateAsUpdate(replica, vector), ADA.key);
  }
  const rowOf = (table: Y.XmlElement, index: number) => table.get(index) as Y.XmlElement;

  it('lets a Participant suggest a row or a column’s cell in, or a row or cell deleted', () => {
    expect(
      askedInPlainTable((table) => {
        const row = rowOf(table, 0).clone();
        row.setAttribute('insertion', mark('a1') as never);
        table.insert(1, [row]);
      }),
    ).toBe('participate');
    expect(
      askedInPlainTable((table) => {
        const cell = (rowOf(table, 0).get(0) as Y.XmlElement).clone();
        cell.setAttribute('insertion', mark('a1') as never);
        rowOf(table, 0).insert(1, [cell]);
      }),
    ).toBe('participate');
    expect(
      askedInPlainTable((table) => rowOf(table, 1).setAttribute('deletion', mark('a1') as never)),
    ).toBe('participate');
    expect(
      askedInPlainTable((table) =>
        (rowOf(table, 1).get(0) as Y.XmlElement).setAttribute('deletion', mark('a1') as never),
      ),
    ).toBe('participate');
  });

  it('asks for Editing to take a row or a cell away, or to add one plainly or as another', () => {
    expect(askedInPlainTable((table) => table.delete(1, 1))).toBe('edit');
    expect(askedInPlainTable((table) => rowOf(table, 0).delete(0, 1))).toBe('edit');
    expect(askedInPlainTable((table) => table.insert(1, [rowOf(table, 0).clone()]))).toBe('edit');
    expect(
      askedInPlainTable((table) => {
        const row = rowOf(table, 0).clone();
        row.setAttribute('insertion', mark('b1', BEN) as never);
        table.insert(1, [row]);
      }),
    ).toBe('edit');
  });

  it('lets a Participant withdraw their own suggestion and suggest a deletion over another’s', () => {
    expect(
      askedOn((_, run) => {
        run.insert(0, 'new ', { insertion: mark('a1') });
        run.delete(0, 4);
      }),
    ).toBe('participate');
    expect(askedOn((_, __, ben) => ben.format(0, 3, { deletion: mark('a1') }))).toBe('participate');
  });

  it('asks for Editing to type, to accept or reject another’s suggestion, or to write as another', () => {
    expect(askedOn((_, run) => run.insert(0, 'new '))).toBe('edit');
    expect(askedOn((_, __, ben) => ben.format(0, 3, { insertion: null }))).toBe('edit');
    expect(askedOn((_, __, ben) => ben.delete(0, 3))).toBe('edit');
    expect(askedOn((_, run) => run.insert(0, 'new ', { insertion: mark('a1', BEN) }))).toBe('edit');
    expect(askedOn((_, run) => run.format(0, 9, { bold: { value: true } }))).toBe('edit');
  });

  it('asks for Editing to accept one’s own suggestion', () => {
    expect(
      askedOn((_, run) => {
        run.insert(0, 'new ', { insertion: mark('a1') });
        run.format(0, 4, { insertion: null });
      }),
    ).toBe('edit');
  });

  it('asks for Editing for a malformed mark, a header, past the limit, or with no key', () => {
    expect(
      askedOn((_, run) =>
        run.insert(0, 'x', {
          insertion: { id: 'a1', at: 5, author: { key: ADA.key, name: 'Ada' } },
        }),
      ),
    ).toBe('edit');
    expect(
      askedOn((doc) => doc.getXmlFragment('header:h1').push([new Y.XmlElement('paragraph')])),
    ).toBe('edit');
    expect(askedOn((_, run) => run.insert(0, 'x', { insertion: mark('a1') }), null)).toBe('edit');
    expect(
      askedOn((_, run) => {
        for (let i = 0; i < TEXT_DOCUMENT_SUGGESTIONS_MAX; i++)
          run.insert(0, 'x', { insertion: mark(`a${i}`) });
      }),
    ).toBe('edit');
  });

  it('judges threads and the writing together', () => {
    expect(
      askedOn((doc, run) => {
        run.insert(0, 'x', { insertion: mark('a1') });
        LiveThreads.begin(
          doc,
          {
            id: 'forged',
            tab: 't.0',
            ...LiveThreads.anchorFor(run, 0, 1),
            quote: 'x',
            comment: comment('f1', BEN),
          },
          'me',
        );
      }),
    ).toBe('edit');
    expect(
      askedOn((doc, run) => {
        run.insert(0, 'x', { insertion: mark('a1') });
        LiveThreads.begin(
          doc,
          {
            id: 'own',
            tab: 't.0',
            ...LiveThreads.anchorFor(run, 0, 1),
            quote: 'x',
            comment: comment('o1'),
          },
          'me',
        );
      }),
    ).toBe('participate');
  });
});
