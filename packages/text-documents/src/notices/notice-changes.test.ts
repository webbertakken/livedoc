import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { DELETION_MARK, INSERTION_MARK, PICTURE, THREADS_MAP } from '../live/live-names';
import { BODY_FRAGMENT } from '../live/live-root';
import { VersionSnapshots, type DeleteSet } from '../versions/version-snapshots';
import { NoticeChanges, type NoticeBaseline } from './notice-changes';

const KEYS: Record<number, string> = { 1: 'ann', 2: 'bob', 3: 'cat' };
const mark = { id: 's1', at: 1, author: { key: 'bob', name: 'Bob', colour: '#000' } };

/** A tab whose body holds one paragraph per text, written by client 1. */
function tab(...texts: string[]) {
  const doc = new Y.Doc({ gc: false });
  doc.clientID = 1;
  const body = doc.getXmlFragment(BODY_FRAGMENT);
  for (const text of texts) {
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText(text)]);
    body.push([paragraph]);
  }
  const deleters = new Map<string, DeleteSet>();
  const encoded = () =>
    new Map([...deleters].map(([key, ds]) => [key, VersionSnapshots.encodeDeletions(ds)]));
  const textOf = (i: number) => (body.get(i) as Y.XmlElement).get(0) as Y.XmlText;
  return {
    doc,
    body,
    textOf,
    encoded,
    baseline: (): NoticeBaseline => VersionSnapshots.stateOf(Y.encodeStateAsUpdate(doc)),
    /** Writes as `client`, keeping its deletions under its key as the room does. */
    as: (client: number, write: () => void) => {
      doc.clientID = client;
      const updates: Uint8Array[] = [];
      const keep = (u: Uint8Array) => updates.push(u);
      doc.on('update', keep);
      doc.transact(write);
      doc.off('update', keep);
      for (const u of updates) {
        const ds = VersionSnapshots.deletionsOf(u);
        const key = KEYS[client]!;
        deleters.set(key, VersionSnapshots.union([deleters.get(key) ?? Y.createDeleteSet(), ds]));
      }
    },
  };
}

const since = (t: ReturnType<typeof tab>, baseline: NoticeBaseline) =>
  NoticeChanges.since(t.doc, baseline, {
    ofClient: (client) => KEYS[client] ?? null,
    deleters: t.encoded(),
  });

describe('NoticeChanges.since', () => {
  it('finds nothing when nothing was written', () => {
    const t = tab('Hello world');
    expect(since(t, t.baseline())).toEqual([]);
  });

  it('finds writing added and removed, each with its author', () => {
    const t = tab('Hello world');
    const base = t.baseline();
    t.as(2, () => t.textOf(0).insert(11, ' again'));
    t.as(3, () => t.textOf(0).delete(0, 6));
    expect(since(t, base)).toEqual([
      { kind: 'removed', text: 'Hello', author: 'cat' },
      { kind: 'added', text: 'again', author: 'bob' },
    ]);
  });

  it('joins one author’s writing across paragraphs, and keeps others apart', () => {
    const t = tab('One');
    const base = t.baseline();
    t.as(2, () => {
      for (const text of ['Two', 'Three']) {
        const p = new Y.XmlElement('paragraph');
        p.insert(0, [new Y.XmlText(text)]);
        t.body.push([p]);
      }
    });
    t.as(3, () => {
      const p = new Y.XmlElement('paragraph');
      p.insert(0, [new Y.XmlText('Four')]);
      t.body.push([p]);
    });
    expect(since(t, base)).toEqual([
      { kind: 'added', text: 'Two Three', author: 'bob' },
      { kind: 'added', text: 'Four', author: 'cat' },
    ]);
  });

  it('never counts a pending suggestion, on either side', () => {
    const t = tab('Keep this');
    const base = t.baseline();
    t.as(2, () => {
      t.textOf(0).insert(9, ' maybe', { [INSERTION_MARK]: mark });
      t.textOf(0).format(0, 4, { [DELETION_MARK]: mark });
    });
    expect(since(t, base)).toEqual([]);
  });

  it('counts an accepted insertion as its suggester’s, and an accepted deletion as the accepter’s', () => {
    const t = tab('Keep this');
    t.as(2, () => {
      t.textOf(0).insert(9, ' too', { [INSERTION_MARK]: mark });
      t.textOf(0).format(0, 5, { [DELETION_MARK]: mark });
    });
    const base = t.baseline();
    t.as(1, () => {
      t.textOf(0).format(9, 4, { [INSERTION_MARK]: null });
      t.textOf(0).delete(0, 5);
    });
    expect(since(t, base)).toEqual([
      { kind: 'removed', text: 'Keep', author: 'ann' },
      { kind: 'added', text: 'too', author: 'bob' },
    ]);
  });

  it('counts nothing for a rejected insertion', () => {
    const t = tab('Text');
    t.as(2, () => t.textOf(0).insert(4, ' extra', { [INSERTION_MARK]: mark }));
    const base = t.baseline();
    t.as(1, () => t.textOf(0).delete(4, 6));
    expect(since(t, base)).toEqual([]);
  });

  it('reads a paragraph suggested whole as absent until accepted', () => {
    const t = tab('First');
    const base = t.baseline();
    t.as(2, () => {
      const p = new Y.XmlElement('paragraph');
      p.setAttribute(INSERTION_MARK, mark as never);
      p.insert(0, [new Y.XmlText('Suggested')]);
      t.body.push([p]);
    });
    expect(since(t, base)).toEqual([]);
    t.as(1, () => (t.body.get(1) as Y.XmlElement).removeAttribute(INSERTION_MARK));
    expect(since(t, base)).toEqual([{ kind: 'added', text: 'Suggested', author: 'bob' }]);
  });

  it('names an object in a line, and a whole paragraph removed', () => {
    const t = tab('Gone', 'Stays');
    const base = t.baseline();
    t.as(2, () => {
      const p = t.body.get(1) as Y.XmlElement;
      p.insert(1, [new Y.XmlElement(PICTURE)]);
    });
    t.as(3, () => t.body.delete(0, 1));
    expect(since(t, base)).toEqual([
      { kind: 'removed', text: 'Gone', author: 'cat' },
      { kind: 'added', text: 'a picture', author: 'bob' },
    ]);
  });

  it('leaves an author unknown when no one was recorded, and comments out', () => {
    const t = tab('Text');
    const base = t.baseline();
    t.as(1, () => t.doc.getMap(THREADS_MAP).set('t1', 'a thread'));
    t.doc.clientID = 9;
    t.textOf(0).insert(0, 'New ');
    t.doc.clientID = 9;
    t.textOf(0).delete(4, 4);
    expect(since(t, base)).toEqual([
      { kind: 'added', text: 'New', author: null },
      { kind: 'removed', text: 'Text', author: null },
    ]);
  });

  it('keeps a long change’s text bounded', () => {
    const t = tab('');
    const base = t.baseline();
    t.as(2, () => t.textOf(0).insert(0, 'word '.repeat(1_000)));
    const [change] = since(t, base);
    expect(change!.text.length).toBeLessThanOrEqual(1_000);
  });

  it('reads the body first, then every other part by name', () => {
    const t = tab('Body');
    const base = t.baseline();
    t.as(2, () => {
      for (const name of ['zeta', 'alpha']) {
        const p = new Y.XmlElement('paragraph');
        p.insert(0, [new Y.XmlText(name)]);
        t.doc.getXmlFragment(name).push([p]);
      }
    });
    t.as(3, () => t.textOf(0).insert(4, ' more'));
    expect(since(t, base).map((c) => c.text)).toEqual(['more', 'alpha', 'zeta']);
  });
});
