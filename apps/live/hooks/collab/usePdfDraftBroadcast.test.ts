// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_DRAFT_MAX_POINTS, type RoomOutgoing } from '@livedoc/api-schema';
import { PDF_DRAWING_MAX_POINTS } from '@livedoc/pdf-documents';
import {
  resetPdfDraftsForTests,
  setLocalPdfDraft,
  type PdfLocalDraft,
} from '@/lib/pdf-document/pdf-draft-store';
import { BROADCAST_THROTTLE_MS } from './useEditorBroadcast';
import { usePdfDraftBroadcast } from './usePdfDraftBroadcast';

// docs/specs/035-pdf-documents/live-editing-and-storage.md "A mark as it is made": "Sent".

const LOOK = { colour: '#e11d48', opacity: 1, width: 2 };
const draft = (points: number[], stroke = 's1'): PdfLocalDraft => ({
  tabId: 't',
  page: 'p:1',
  stroke,
  look: LOOK,
  points,
});
const stretch = (from: number, points: number[], stroke = 's1') => ({
  kind: 'pdf-draft',
  tabId: 't',
  page: 'p:1',
  stroke,
  ...LOOK,
  from,
  points,
});
const end = (stroke = 's1') => ({ kind: 'pdf-draft', tabId: 't', stroke, points: null });

let sent: RoomOutgoing[] = [];
const ops = () => sent.map((msg) => (msg as { op: unknown }).op);
const roomRef = { current: { send: (msg: RoomOutgoing) => void sent.push(msg) } };
const broadcast = (props: { live: boolean; hidden: boolean }) =>
  renderHook((p: { live: boolean; hidden: boolean }) => usePdfDraftBroadcast({ roomRef, ...p }), {
    initialProps: props,
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  resetPdfDraftsForTests();
  sent = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePdfDraftBroadcast', () => {
  it('sends a stroke as it grows, each op the points since the last, the last always following', () => {
    broadcast({ live: true, hidden: false });
    setLocalPdfDraft(draft([1, 2]));
    setLocalPdfDraft(draft([1, 2, 3, 4]));
    setLocalPdfDraft(draft([1, 2, 3, 4, 5, 6]));
    expect(ops()).toEqual([stretch(0, [1, 2])]);
    vi.advanceTimersByTime(BROADCAST_THROTTLE_MS);
    expect(ops()).toEqual([stretch(0, [1, 2]), stretch(1, [3, 4, 5, 6])]);
  });

  it('sends the last points of a stroke let go, then its end', () => {
    broadcast({ live: true, hidden: false });
    setLocalPdfDraft(draft([1, 2]));
    setLocalPdfDraft(draft([1, 2, 3, 4]));
    setLocalPdfDraft(null);
    vi.advanceTimersByTime(BROADCAST_THROTTLE_MS);
    expect(ops()).toEqual([stretch(0, [1, 2]), stretch(1, [3, 4]), end()]);
  });

  it('ends a stroke followed by another, and begins the next at 0', () => {
    broadcast({ live: true, hidden: false });
    setLocalPdfDraft(draft([1, 2]));
    vi.advanceTimersByTime(BROADCAST_THROTTLE_MS);
    setLocalPdfDraft(draft([7, 8], 's2'));
    expect(ops()).toEqual([stretch(0, [1, 2]), end(), stretch(0, [7, 8], 's2')]);
  });

  it('sends a long stretch as several ops of PDF_DRAFT_MAX_POINTS at most', () => {
    broadcast({ live: true, hidden: false });
    const points = Array.from({ length: (PDF_DRAFT_MAX_POINTS + 3) * 2 }, (_, at) => at);
    setLocalPdfDraft(draft(points));
    const first = ops() as { from: number; points: number[] }[];
    expect(first.map((op) => [op.from, op.points.length])).toEqual([
      [0, PDF_DRAFT_MAX_POINTS * 2],
      [PDF_DRAFT_MAX_POINTS, 6],
    ]);
  });

  it('sends no more of a stroke past PDF_DRAWING_MAX_POINTS, but still its end', () => {
    broadcast({ live: true, hidden: false });
    const points = Array.from({ length: (PDF_DRAWING_MAX_POINTS + 10) * 2 }, (_, at) => at % 50);
    setLocalPdfDraft(draft(points));
    const sentPoints = (ops() as { points: number[] }[]).reduce((n, op) => n + op.points.length, 0);
    expect(sentPoints).toBe(PDF_DRAWING_MAX_POINTS * 2);
    vi.advanceTimersByTime(BROADCAST_THROTTLE_MS);
    setLocalPdfDraft(null);
    expect(ops().at(-1)).toEqual(end());
  });

  it('sends nothing while the room is closed or a hide-cursors vote is open, and ends a stroke shown', () => {
    const { rerender } = broadcast({ live: false, hidden: false });
    setLocalPdfDraft(draft([1, 2]));
    expect(ops()).toEqual([]);
    rerender({ live: true, hidden: false });
    setLocalPdfDraft(draft([1, 2, 3, 4]));
    expect(ops()).toEqual([stretch(0, [1, 2, 3, 4])]);
    rerender({ live: true, hidden: true });
    expect(ops().at(-1)).toEqual(end());
    vi.advanceTimersByTime(BROADCAST_THROTTLE_MS);
    setLocalPdfDraft(draft([1, 2, 3, 4, 5, 6]));
    expect(ops()).toHaveLength(2);
  });
});
