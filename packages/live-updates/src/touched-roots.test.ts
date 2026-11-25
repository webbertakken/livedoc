// The roots an update lands in, read by applying it to the stored state (docs/specs/006-document/
// kinds-outside-the-canvas.md "Live state": a room judges a Participant's update by what it touches): nested types
// count as their root's, and an update standing on changes the state lacks, or no update at all, cannot be read.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { touchedRoots } from './touched-roots';

function replicaOf(doc: Y.Doc) {
  const replica = new Y.Doc();
  Y.applyUpdate(replica, Y.encodeStateAsUpdate(doc));
  return replica;
}

describe('touchedRoots', () => {
  it('names each root the update lands in, a nested type counting as its root', () => {
    const doc = new Y.Doc();
    doc.getMap('threads').set('t', new Y.Map());
    const replica = replicaOf(doc);
    const before = Y.encodeStateVector(replica);
    (replica.getMap('threads').get('t') as Y.Map<unknown>).set('resolved', true);
    replica.getText('body').insert(0, 'hi');
    const update = Y.encodeStateAsUpdate(replica, before);
    expect(touchedRoots(doc, update)).toEqual(new Set(['threads', 'body']));
    expect(doc.getText('body').toJSON()).toBe('hi');
  });

  it('names a root a deletion lands in, and no root it leaves alone', () => {
    const doc = new Y.Doc();
    doc.getMap('threads').set('kept', 1);
    doc.getText('body').insert(0, 'hello');
    const replica = replicaOf(doc);
    const before = Y.encodeStateVector(replica);
    replica.getText('body').delete(0, 1);
    expect(touchedRoots(doc, Y.encodeStateAsUpdate(replica, before))).toEqual(new Set(['body']));
  });

  it('cannot read an update standing on changes the state lacks, items or deletions', () => {
    const doc = new Y.Doc();
    const replica = replicaOf(doc);
    replica.getText('body').insert(0, 'a');
    const missing = Y.encodeStateVector(replica);
    replica.getText('body').insert(1, 'b');
    expect(touchedRoots(doc, Y.encodeStateAsUpdate(replica, missing))).toBe('unreadable');
    const other = new Y.Doc();
    other.getText('body').insert(0, 'x');
    const held = Y.encodeStateVector(other);
    other.getText('body').delete(0, 1);
    expect(touchedRoots(new Y.Doc(), Y.encodeStateAsUpdate(other, held))).toBe('unreadable');
  });

  it('cannot read bytes that are no update', () => {
    expect(touchedRoots(new Y.Doc(), new Uint8Array([1, 2, 3]))).toBe('unreadable');
  });
});
