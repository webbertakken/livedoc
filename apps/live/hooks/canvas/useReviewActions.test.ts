// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEveryKindFamily } from '@/lib/element-kinds/load-every-family';
import { eventStormingKindOf, type Element, type Tab } from '@livedoc/document';
import { readBoard, type StormGap } from '@livedoc/storm-reading';
import { useReviewActions } from './useReviewActions';

// The acts are the Event Storming family's, reached through the registry (lib/element-kinds).
beforeAll(loadEveryKindFamily);

// The Review panel's writes (docs/specs/021-event-storming/board-review.md "Check", board-language.md "The Language
// tab"): each one commit, telemetry once, a refusal logged and never written, and never the words in a log.

const track = vi.fn<typeof import('@/lib/telemetry').track>();
vi.mock('@/lib/telemetry', () => ({ track: (...a: Parameters<typeof track>) => track(...a) }));
const debugLog = vi.fn<(...a: unknown[]) => void>();
vi.mock('@/lib/debug-log', () => ({ debugLog: (...a: unknown[]) => debugLog(...a) }));

const note = (id: string, esKind: string, label: string, x: number): Element =>
  ({
    id,
    type: 'sticky',
    x,
    y: 0,
    width: 200,
    height: 200,
    label,
    esKind,
    fixedSize: true,
  }) as Element;

const board: Element[] = [
  note('bill', 'command', 'Present bill', 0),
  note('paid', 'domain-event', 'Bill paid', 216),
  note('cleared', 'domain-event', 'Table cleared', 648),
];
const tab = { id: 't', name: 'Kitchen', kind: 'event-storming', elements: board } as Tab;
const gap = (code: string): StormGap => readBoard(tab).gaps.find((g) => g.code === code)!;

function setup(blocked = false) {
  let current = board;
  const commit = vi.fn((mapper: (els: Element[]) => Element[]) => {
    current = mapper(current);
  });
  const openForTyping = vi.fn<(id: string) => void>();
  const acts = renderHook(() =>
    useReviewActions({ activeTab: tab, blocked, layerInertIds: new Set(), commit, openForTyping }),
  ).result.current;
  return { acts, commit, openForTyping, now: () => current };
}

beforeEach(() => {
  track.mockClear();
  debugLog.mockClear();
});

describe('useReviewActions: Add', () => {
  it('lands a blank note of the remedy’s kind beside the note it names, in one commit, opened for typing', () => {
    const { acts, commit, openForTyping, now } = setup();
    acts.addForGap(gap('event_without_cause'));
    expect(commit).toHaveBeenCalledTimes(1);
    const added = now().filter((el) => !board.includes(el) && !board.some((b) => b.id === el.id));
    expect(added).toHaveLength(1);
    const landed = added[0]! as Element & { x: number; label?: string; esSuggestion?: unknown };
    expect(eventStormingKindOf(landed)).toBe('command');
    expect(landed.label ?? '').toBe('');
    expect(landed.esSuggestion).toBeUndefined();
    // Before the event it leads to, and after the event before that.
    const cleared = now().find((el) => el.id === 'cleared') as Element & { x: number };
    expect(landed.x).toBeLessThan(cleared.x);
    expect(landed.x).toBeGreaterThan(216);
    expect(openForTyping).toHaveBeenCalledWith(landed.id);
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'GapNoteAdded');
    expect(track).toHaveBeenCalledWith('Element', 'Added', 'Sticky');
    expect(debugLog).toHaveBeenCalledWith('[review] add', { code: 'event_without_cause' });
  });

  it('lands an actor on the lane above the command it issues', () => {
    const { acts, now } = setup();
    acts.addForGap(gap('command_without_trigger'));
    const actor = now().find((el) => eventStormingKindOf(el) === 'actor')! as Element & {
      x: number;
      y: number;
    };
    expect(actor.x).toBe(0);
    expect(actor.y).toBeLessThan(0);
  });

  it('refuses a gap with no remedy, a note that is gone, and a session that may not add', () => {
    const { acts, commit, openForTyping } = setup();
    acts.addForGap({ ...gap('event_without_cause'), remedy: null });
    acts.addForGap({
      ...gap('event_without_cause'),
      remedy: { kind: 'command', side: 'before', anchor: 'gone' },
    });
    setup(true).acts.addForGap(gap('event_without_cause'));
    expect(commit).not.toHaveBeenCalled();
    expect(openForTyping).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalledTimes(3);
    expect(debugLog).toHaveBeenCalledWith('[review] add refused', { code: 'event_without_cause' });
  });
});

describe('useReviewActions: Rename Term', () => {
  it('renames a term where it is used, in one commit, logging counts and never words', () => {
    const { acts, commit, now } = setup();
    acts.renameTerm('bill', 'check', { type: 'board' });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(now().map((el) => (el as { label?: string }).label)).toEqual([
      'Present check',
      'Check paid',
      'Table cleared',
    ]);
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'TermRenamed');
    expect(debugLog).toHaveBeenCalledWith('[review] term renamed', {
      notes: 2,
      contexts: 0,
      scoped: false,
    });
  });

  it('writes nothing when nothing would change, or for a session that may not rename', () => {
    const { acts, commit } = setup();
    acts.renameTerm('bill', 'bill', { type: 'board' });
    acts.renameTerm('bill', 'check', { type: 'context', id: 'nowhere' });
    const blocked = setup(true);
    blocked.acts.renameTerm('bill', 'check', { type: 'board' });
    expect(commit).not.toHaveBeenCalled();
    expect(blocked.commit).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalledWith('[review] rename refused', { blocked: true });
  });
});
