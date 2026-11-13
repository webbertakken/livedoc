import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CandidateContextElement, Element } from '@livedoc/document';
import { contextDropOnRelease } from './context-drop-on-release';

// docs/specs/021-event-storming/candidate-contexts.md "Joining and leaving, exactly" and "Telemetry".

const track = vi.fn<typeof import('@/lib/telemetry').track>();
vi.mock('@/lib/telemetry', () => ({ track: (...a: Parameters<typeof track>) => track(...a) }));
const debugLog = vi.fn();
vi.mock('@/lib/debug-log', () => ({ debugLog: (...a: unknown[]) => debugLog(...a) }));

const note = (id: string, x: number): Element => ({
  id,
  type: 'sticky',
  x,
  y: 0,
  width: 200,
  height: 200,
  label: id,
  esKind: 'domain-event',
});
const context = (id: string, notes: string[]): CandidateContextElement => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  label: id,
  esContext: { notes },
});
const committed: Element[] = [note('a', 0), note('b', 300), note('e', 3000), context('k', ['a'])];
const notesOf = (els: Element[]) =>
  (els.find((el) => el.id === 'k') as CandidateContextElement).esContext.notes;

beforeEach(() => {
  track.mockClear();
  debugLog.mockClear();
});

describe('contextDropOnRelease', () => {
  it('joins a note let go inside an outline, in the drag’s own change, and counts it', () => {
    const released = committed.map((el) => (el.id === 'e' ? { ...el, x: 50 } : el));
    const out = contextDropOnRelease(committed, new Set(['e']))(released);
    expect(notesOf(out)).toEqual(['a', 'e']);
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'ContextNoteJoined');
    expect(debugLog).toHaveBeenCalledWith('[contexts] drop', { joined: 1, left: 0 });
  });

  it('lets a note go when it is dragged clear, and counts that', () => {
    const two = [...committed.slice(0, 3), context('k', ['a', 'b'])];
    const released = two.map((el) => (el.id === 'b' ? { ...el, x: 2000 } : el));
    const out = contextDropOnRelease(two, new Set(['b']))(released);
    expect(notesOf(out)).toEqual(['a']);
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'ContextNoteLeft');
  });

  it('leaves the result alone when nothing joins or leaves', () => {
    const released = committed.map((el) => (el.id === 'e' ? { ...el, x: 3100 } : el));
    expect(contextDropOnRelease(committed, new Set(['e']))(released)).toBe(released);
    expect(track).not.toHaveBeenCalled();
  });
});
