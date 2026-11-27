import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { TextDocumentState } from '../text-document-state';
import { deleteRange, VersionSnapshots, type DeleteSet } from './version-snapshots';

// A document written in steps by fresh clients, with deletions, and the whole snapshot after each step.
function written(steps: number): { doc: Y.Doc; snapshots: Y.Snapshot[] } {
  const doc = TextDocumentState.load();
  const snapshots: Y.Snapshot[] = [];
  for (let step = 0; step < steps; step += 1) {
    const writer = TextDocumentState.load([Y.encodeStateAsUpdate(doc)]);
    const body = TextDocumentState.body(writer);
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText(`step ${step} words here`)]);
    body.insert(body.length, [paragraph]);
    if (step > 0) ((body.get(body.length - 2) as Y.XmlElement).get(0) as Y.XmlText).delete(0, 5);
    if (step > 2) body.delete(0, 1);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(writer, Y.encodeStateVector(doc)));
    snapshots.push(Y.snapshot(doc));
  }
  return { doc, snapshots };
}

describe('VersionSnapshots', () => {
  it('encodes deletions and reads them back', () => {
    const { snapshots } = written(4);
    const ds = snapshots[3]!.ds;
    const read = VersionSnapshots.decodeDeletions(VersionSnapshots.encodeDeletions(ds));
    expect(Y.equalDeleteSets(read, ds)).toBe(true);
  });

  it('reads an update’s deletions', () => {
    const { doc, snapshots } = written(3);
    const ds = VersionSnapshots.deletionsOf(Y.encodeStateAsUpdate(doc));
    expect(Y.equalDeleteSets(ds, snapshots[2]!.ds)).toBe(true);
  });

  it('keeps only the deletions a version adds, and reads each version whole from them', () => {
    const { snapshots } = written(6);
    const kept: DeleteSet[] = [];
    snapshots.forEach((snapshot) => {
      kept.push(VersionSnapshots.added(snapshot.ds, kept));
      const read = VersionSnapshots.snapshotOf(Y.encodeStateVector(snapshot.sv), kept);
      expect(Y.equalSnapshots(read, snapshot)).toBe(true);
    });
  });

  it('subtracts ranges that overlap part of a range', () => {
    const a = Y.createDeleteSet();
    a.clients.set(1, [deleteRange(0, 10)]);
    const b = Y.createDeleteSet();
    b.clients.set(1, [deleteRange(2, 3), deleteRange(8, 5)]);
    const left = VersionSnapshots.minus(a, b)
      .clients.get(1)!
      .map((r) => [r.clock, r.len]);
    expect(left).toEqual([
      [0, 2],
      [5, 3],
    ]);
  });

  it('leaves a client out whose every range is subtracted', () => {
    const a = Y.createDeleteSet();
    a.clients.set(4, [deleteRange(3, 2)]);
    expect(VersionSnapshots.minus(a, a).clients.has(4)).toBe(false);
  });

  it('names the clients an update writes with', () => {
    const doc = new Y.Doc({ gc: false });
    doc.clientID = 42;
    doc.getText('t').insert(0, 'hello');
    expect(VersionSnapshots.clientsOf(Y.encodeStateAsUpdate(doc))).toEqual([42]);
  });

  it('names the clients that wrote between two state vectors', () => {
    const { snapshots } = written(3);
    const before = Y.encodeStateVector(snapshots[0]!.sv);
    const after = Y.encodeStateVector(snapshots[2]!.sv);
    expect(VersionSnapshots.advanced(before, after)).toHaveLength(2);
    expect(VersionSnapshots.advanced(after, after)).toEqual([]);
  });

  it('tells equal state vectors', () => {
    const { snapshots } = written(2);
    const sv = (i: number) => Y.encodeStateVector(snapshots[i]!.sv);
    expect(VersionSnapshots.sameState(sv(1), sv(1))).toBe(true);
    expect(VersionSnapshots.sameState(sv(0), sv(1))).toBe(false);
  });
});
