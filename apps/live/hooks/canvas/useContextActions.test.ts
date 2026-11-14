// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CandidateContextElement, Element, Tab } from '@livedoc/document';
import { useContextActions } from './useContextActions';
import { noteContextMenu } from '@/lib/note-context-menu';

// The kept candidate context acts (docs/specs/021-event-storming/candidate-contexts.md "How a person sees and
// decides"): each one commit, telemetry once per change, a refusal logged and never written.

const track = vi.fn<typeof import('@/lib/telemetry').track>();
vi.mock('@/lib/telemetry', () => ({ track: (...a: Parameters<typeof track>) => track(...a) }));
const debugLog = vi.fn<(...a: unknown[]) => void>();
vi.mock('@/lib/debug-log', () => ({ debugLog: (...a: unknown[]) => debugLog(...a) }));

const note = (id: string, x: number, extra: Record<string, unknown> = {}): Element => ({
  id,
  type: 'sticky',
  x,
  y: 0,
  width: 200,
  height: 200,
  label: id,
  esKind: 'domain-event',
  ...extra,
});
const context = (id: string, notes: string[], suggested = false): CandidateContextElement => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  label: `Ctx ${id}`,
  esContext: { notes, ...(suggested ? { suggestion: {} } : {}) },
});

const board: Element[] = [
  note('a', 0),
  note('b', 300),
  note('c', 600),
  context('k', ['a', 'b']),
  context('j', ['c']),
  context('s', ['c'], true),
];

function setup(elements: Element[] = board, createBlocked = false) {
  let current = elements;
  const commit = vi.fn((mapper: (els: Element[]) => Element[]) => {
    current = mapper(current);
  });
  const acts = renderHook(() =>
    useContextActions({ activeTab: { id: 't', elements } as Tab, createBlocked, commit }),
  ).result.current;
  const ctx = (id: string) =>
    current.find((el) => el.id === id) as CandidateContextElement | undefined;
  return { acts, commit, ctx };
}

beforeEach(() => {
  track.mockClear();
  debugLog.mockClear();
});

describe('useContextActions', () => {
  it('renames a kept context in one commit', () => {
    const { acts, commit, ctx } = setup();
    acts.rename('k', ' Billing ');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(ctx('k')!.label).toBe('Billing');
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'ContextRenamed');
  });

  it('keeps the name for an empty one, and writes nothing', () => {
    const { acts, commit } = setup();
    acts.rename('k', '   ');
    expect(commit).not.toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalledWith('[contexts] refused', { reason: 'unchanged' });
  });

  it('deletes a kept context, its notes staying', () => {
    const { acts, ctx } = setup();
    acts.remove('k');
    expect(ctx('k')).toBeUndefined();
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'ContextDeleted');
  });

  it('adds a note to a kept context, taking it from its own', () => {
    const { acts, ctx } = setup();
    acts.addNotes('k', ['c']);
    expect(ctx('k')!.esContext.notes).toEqual(['a', 'b', 'c']);
    expect(ctx('j')).toBeUndefined();
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'ContextNoteJoined');
  });

  it('writes nothing for a note already in that context', () => {
    const { acts, commit } = setup();
    acts.addNotes('k', ['a']);
    expect(commit).not.toHaveBeenCalled();
  });

  it('removes a note from its context', () => {
    const { acts, ctx } = setup();
    acts.removeNotes(['a']);
    expect(ctx('k')!.esContext.notes).toEqual(['b']);
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'ContextNoteLeft');
  });

  it('refuses a note in no context, a suggested or unknown context, and a blocked board', () => {
    const { acts, commit } = setup([note('a', 0), context('s', ['a'], true)]);
    acts.removeNotes(['zz']);
    acts.remove('nope');
    acts.addNotes('s', ['a']);
    expect(commit).not.toHaveBeenCalled();
    const blocked = setup(board, true);
    blocked.acts.remove('k');
    expect(blocked.commit).not.toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalledWith('[contexts] refused', { reason: 'blocked' });
  });
});

describe('useContextActions: merging and naming suggestions', () => {
  it('merges contexts in one commit and answers the one kept', () => {
    const { acts, commit, ctx } = setup();
    expect(acts.merge(['k', 'j'])).toBe('k');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(ctx('k')!.esContext.notes).toEqual(['a', 'b', 'c']);
    expect(ctx('j')).toBeUndefined();
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'ContextsMerged');
  });

  it('refuses to merge fewer than two', () => {
    const { acts, commit } = setup();
    expect(acts.merge(['k'])).toBeNull();
    expect(commit).not.toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalledWith('[contexts] refused', { reason: 'too-few' });
  });

  it('renames a suggested context, and refuses what is no context', () => {
    const { acts, ctx } = setup();
    acts.rename('s', 'Joined');
    expect(ctx('s')!.label).toBe('Joined');
    acts.rename('a', 'Nope');
    expect(debugLog).toHaveBeenCalledWith('[contexts] refused', { reason: 'not-a-context' });
  });
});

describe('noteContextMenu', () => {
  const acts = { addNotes: vi.fn(), removeNotes: vi.fn() };

  it('lists the kept contexts by name with the one the note is in', () => {
    const menu = noteContextMenu(board, 'a', acts)!;
    expect(menu.contexts).toEqual([
      { id: 'j', name: 'Ctx j' },
      { id: 'k', name: 'Ctx k' },
    ]);
    expect(menu.currentId).toBe('k');
    menu.onAdd('j');
    expect(acts.addNotes).toHaveBeenCalledWith('j', ['a']);
    menu.onRemove();
    expect(acts.removeNotes).toHaveBeenCalledWith(['a']);
  });

  it('says a note in a suggested context is in no kept one', () => {
    expect(
      noteContextMenu([note('c', 0), context('s', ['c'], true), context('k', ['x'])], 'c', acts)!
        .currentId,
    ).toBeNull();
  });

  it('offers nothing for what is no note, or on a board without kept contexts', () => {
    expect(noteContextMenu(board, 'k', acts)).toBeNull();
    expect(noteContextMenu(board, 'missing', acts)).toBeNull();
    expect(noteContextMenu([note('a', 0)], 'a', acts)).toBeNull();
  });
});
