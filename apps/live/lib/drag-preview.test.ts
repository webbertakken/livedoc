// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createShape, type Element } from '@livedoc/document';
import {
  applyOverlay,
  clearLocalPreview,
  clearOfferedPreview,
  clearPeerPreview,
  dragPreviewFor,
  localPreview,
  resetDragPreviewForTests,
  setLocalPreview,
  setOfferedPreview,
  setPeerPreview,
  useDragPreview,
  useLocalDragPreview,
} from './drag-preview';

// docs/specs/008-canvas/drag-preview.md "The preview".

const a = createShape('square', 0, 0);
const b = createShape('square', 200, 0);
const c = createShape('square', 400, 0);
const doc: Element[] = [a, b, c];
const ids = (els: readonly Element[]) => els.map((e) => e.id);

afterEach(() => resetDragPreviewForTests());

describe('the local preview', () => {
  it('holds what a gesture changed, by identity', () => {
    const movedB = { ...b, x: 250 };
    setLocalPreview('t', [a, movedB, c], doc);
    const o = localPreview()!;
    expect([...o.changed.keys()]).toEqual([b.id]);
    expect(o.changed.get(b.id)).toBe(movedB);
    expect(o.removed.size).toBe(0);
    expect(o.added).toEqual([]);
  });

  it('records what a gesture added after its neighbour, and what it removed', () => {
    const copy = { ...a, id: 'copy' };
    setLocalPreview('t', [a, copy, b], doc);
    const o = localPreview()!;
    expect(o.added).toEqual([{ el: copy, after: a.id }]);
    expect([...o.removed]).toEqual([c.id]);
  });

  it('is gone once cleared', () => {
    setLocalPreview('t', [a, { ...b, x: 9 }, c], doc);
    clearLocalPreview();
    expect(localPreview()).toBeNull();
  });
});

describe('applyOverlay', () => {
  it('replaces, drops and inserts, keeping the order', () => {
    const movedB = { ...b, x: 250 };
    const copy = { ...a, id: 'copy' };
    setLocalPreview('t', [copy, a, movedB], doc);
    const out = applyOverlay(doc, localPreview()!);
    expect(ids(out)).toEqual(['copy', a.id, b.id]);
    expect(out[2]).toBe(movedB);
  });

  it('keeps changes made beneath it, and skips an element deleted beneath it', () => {
    const movedB = { ...b, x: 250 };
    setLocalPreview('t', [a, movedB, c], doc);
    const peerMovedC = { ...c, y: 99 };
    expect(applyOverlay([a, peerMovedC], localPreview()!)).toEqual([a, peerMovedC]);
    expect(applyOverlay([a, b, peerMovedC], localPreview()!)).toEqual([a, movedB, peerMovedC]);
  });

  it('puts an addition whose neighbour is gone at the end', () => {
    const copy = { ...a, id: 'copy' };
    setLocalPreview('t', [a, copy, b, c], doc);
    expect(ids(applyOverlay([b, c], localPreview()!))).toEqual([b.id, c.id, 'copy']);
  });
});

describe('useDragPreview', () => {
  it('follows the local preview for its tab only', () => {
    const { result } = renderHook(() => useDragPreview('t', doc));
    expect(result.current).toBeNull();
    act(() => setLocalPreview('t', [a, { ...b, x: 1 }, c], doc));
    expect(result.current?.changed.has(b.id)).toBe(true);
    act(() => setLocalPreview('other', [a, { ...b, x: 2 }, c], doc));
    expect(result.current).toBeNull();
  });

  it('resolves peer patches against the elements drawn, beneath the local preview', () => {
    const { result } = renderHook(() => useDragPreview('t', doc));
    act(() =>
      setPeerPreview('p1', 't', [
        { id: b.id, x: 7 },
        { id: c.id, x: 8 },
        { id: 'gone', x: 1 },
      ]),
    );
    expect(result.current!.changed.get(c.id)).toEqual({ ...c, x: 8 });
    expect(result.current!.changed.has('gone')).toBe(false);
    const localB = { ...b, x: 9 };
    act(() => setLocalPreview('t', [a, localB, c], doc));
    expect(result.current!.changed.get(b.id)).toBe(localB);
    act(() => {
      clearLocalPreview();
      clearPeerPreview('p1');
    });
    expect(result.current).toBeNull();
  });

  it('ignores a peer preview for another tab', () => {
    const { result } = renderHook(() => useDragPreview('t', doc));
    act(() => setPeerPreview('p1', 'other', [{ id: b.id, x: 7 }]));
    expect(result.current).toBeNull();
  });

  it('keeps one merged object until something changes', () => {
    const { result, rerender } = renderHook(() => useDragPreview('t', doc));
    act(() => setLocalPreview('t', [a, { ...b, x: 1 }, c], doc));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe('several readers', () => {
  it('gives each reader a stable preview, whatever elements each draws', () => {
    const other: Element[] = [a, b];
    const first = renderHook(() => useDragPreview('t', doc));
    const second = renderHook(() => useDragPreview('t', other));
    act(() => setPeerPreview('p1', 't', [{ id: b.id, x: 7 }]));
    const one = first.result.current;
    const two = second.result.current;
    first.rerender();
    second.rerender();
    expect(first.result.current).toBe(one);
    expect(second.result.current).toBe(two);
  });
});

// What an offered change would make of the board (docs/specs/021-event-storming/suggested-changes.md "A preview never
// writes"): drawn as a drag is, never sent and never a note in hand.
describe('the offered preview', () => {
  it('is drawn in place of the elements it changes, for its tab only', () => {
    const reworded = { ...b, label: 'Booking placed' };
    setOfferedPreview('t', [a, reworded, c], doc);
    expect(dragPreviewFor('t', doc)?.changed.get(b.id)).toBe(reworded);
    expect(dragPreviewFor('other', doc)).toBeNull();
  });

  it('is never this person’s drag: nothing is sent and no note is in hand', () => {
    setOfferedPreview('t', [a, { ...b, label: 'x' }, c], doc);
    expect(localPreview()).toBeNull();
    const { result } = renderHook(() => useLocalDragPreview('t'));
    expect(result.current).toBeNull();
  });

  it('lies beneath a drag: the drag wins on an element both touch, and each keeps its own', () => {
    const reworded = { ...b, label: 'Booking placed' };
    const offeredC = { ...c, label: 'Booking closed' };
    const draggedB = { ...b, x: 250 };
    setOfferedPreview('t', [a, reworded, offeredC], doc);
    setLocalPreview('t', [a, draggedB, c], doc);
    const overlay = dragPreviewFor('t', doc)!;
    expect(overlay.changed.get(b.id)).toBe(draggedB);
    expect(overlay.changed.get(c.id)).toBe(offeredC);
  });

  it('lies beneath a collaborator’s drag too', () => {
    setOfferedPreview('t', [a, { ...b, label: 'x' }, c], doc);
    setPeerPreview('peer', 't', [{ id: b.id, x: 300 }]);
    expect(dragPreviewFor('t', doc)!.changed.get(b.id)).toMatchObject({ x: 300 });
  });

  it('ends when cleared, and a reader is told', () => {
    const { result } = renderHook(() => useDragPreview('t', doc));
    act(() => setOfferedPreview('t', [a, { ...b, label: 'x' }, c], doc));
    expect(result.current).not.toBeNull();
    act(() => clearOfferedPreview());
    expect(result.current).toBeNull();
  });

  it('is nothing when the offer changes nothing', () => {
    setOfferedPreview('t', doc, doc);
    expect(dragPreviewFor('t', doc)).toBeNull();
  });
});
