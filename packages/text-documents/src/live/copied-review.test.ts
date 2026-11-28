// docs/specs/034-text-documents/files-and-print.md "Make a copy": the copy holds no thread and every pending suggestion
// rejected without Copy comments and suggestions; with it, resolved threads only with Include resolved; both on, the
// state as it was. The bytes of a copy that leaves a thread out hold none of its words.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { CopiedReview } from './copied-review';
import { INSERTION_MARK, DELETION_MARK } from './live-suggestions';
import { LiveThreads } from './live-threads';

const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };
const OPEN_WORDS = 'Open remark';
const RESOLVED_WORDS = 'Settled remark';

/** One paragraph: "Keep ", an insertion "new ", "words", a deletion " old"; an open and a resolved thread. */
function source(): Uint8Array {
  const doc = new Y.Doc();
  const paragraph = new Y.XmlElement('paragraph');
  const run = new Y.XmlText();
  paragraph.insert(0, [run]);
  doc.getXmlFragment('body').insert(0, [paragraph]);
  const mark = (id: string) => ({ id, at: 10, author: ADA });
  run.applyDelta([
    { insert: 'Keep ' },
    { insert: 'new ', attributes: { [INSERTION_MARK]: mark('s1') } },
    { insert: 'words' },
    { insert: ' old', attributes: { [DELETION_MARK]: mark('s2') } },
  ]);
  const thread = (id: string, words: string) => ({
    id,
    tab: 't.0',
    ...LiveThreads.anchorFor(run, 0, 4),
    quote: 'Keep',
    comment: { id: `${id}-c1`, text: words, at: 10, author: ADA },
  });
  LiveThreads.begin(doc, thread('open', OPEN_WORDS), null);
  LiveThreads.begin(doc, thread('done', RESOLVED_WORDS), null);
  LiveThreads.resolve(doc, 'done', true, null);
  return Y.encodeStateAsUpdate(doc);
}

function read(state: Uint8Array) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  const run = (doc.getXmlFragment('body').get(0) as Y.XmlElement).get(0) as Y.XmlText;
  return {
    text: run.toString(),
    plain: run.toJSON(),
    threads: LiveThreads.read(doc).map((t) => t.id),
  };
}

const holds = (state: Uint8Array, words: string) => new TextDecoder().decode(state).includes(words);

describe('CopiedReview', () => {
  it('leaves out every thread and rejects every suggestion without comments', () => {
    const copied = CopiedReview.applied(source(), { comments: false, resolved: false });
    const { plain, threads } = read(copied);
    expect(plain).toBe('Keep words old');
    expect(threads).toEqual([]);
    expect(holds(copied, OPEN_WORDS)).toBe(false);
    expect(holds(copied, RESOLVED_WORDS)).toBe(false);
  });

  it('keeps open threads and suggestions, and leaves out resolved threads, without resolved', () => {
    const copied = CopiedReview.applied(source(), { comments: true, resolved: false });
    const { text, threads } = read(copied);
    expect(threads).toEqual(['open']);
    expect(text).toContain(INSERTION_MARK);
    expect(holds(copied, RESOLVED_WORDS)).toBe(false);
  });

  it('keeps the state as it was with both', () => {
    const state = source();
    expect(CopiedReview.applied(state, { comments: true, resolved: true })).toBe(state);
  });

  it('takes resolved as off without comments', () => {
    const { threads } = read(CopiedReview.applied(source(), { comments: false, resolved: true }));
    expect(threads).toEqual([]);
  });
});
