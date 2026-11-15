// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { answerOf, isPivotalEvent, type Element, type Tab } from '@livedoc/document';
import { useStructureActions } from './useStructureActions';

// The acts on a board's structure (docs/specs/021-event-storming/board-structure.md "Pivotal events", "Hotspot
// answers"): each one commit, telemetry once per change, a refusal logged and never written.

const track = vi.fn<typeof import('@/lib/telemetry').track>();
vi.mock('@/lib/telemetry', () => ({ track: (...a: Parameters<typeof track>) => track(...a) }));
const debugLog = vi.fn<(...a: unknown[]) => void>();
vi.mock('@/lib/debug-log', () => ({ debugLog: (...a: unknown[]) => debugLog(...a) }));

const note = (id: string, esKind: string, extra: Record<string, unknown> = {}): Element =>
  ({
    id,
    type: 'sticky',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    label: id,
    esKind,
    ...extra,
  }) as Element;

const board: Element[] = [
  note('placed', 'domain-event'),
  note('shipped', 'domain-event', { esPivotal: true }),
  note('place', 'command'),
  note('why', 'hotspot'),
  note('who', 'hotspot', { esAnswer: 'The chef.' }),
];

function setup(blocked = false) {
  let current = board;
  const commit = vi.fn((mapper: (els: Element[]) => Element[]) => {
    current = mapper(current);
  });
  const acts = renderHook(() =>
    useStructureActions({ activeTab: { id: 't', elements: board } as Tab, blocked, commit }),
  ).result.current;
  const el = (id: string) => current.find((e) => e.id === id)!;
  return { acts, commit, el };
}

beforeEach(() => {
  track.mockClear();
  debugLog.mockClear();
});

describe('useStructureActions: pivotal events', () => {
  it('marks a domain event in one commit', () => {
    const { acts, commit, el } = setup();
    acts.setPivotal('placed', true);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(isPivotalEvent(el('placed'))).toBe(true);
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'PivotalMarked');
    expect(debugLog).toHaveBeenCalledWith('[structure] pivotal', { on: true });
  });

  it('unmarks one', () => {
    const { acts, commit, el } = setup();
    acts.setPivotal('shipped', false);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(isPivotalEvent(el('shipped'))).toBe(false);
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'PivotalUnmarked');
  });

  it('refuses a note that is no event, a mark already there and a note that is gone', () => {
    const { acts, commit } = setup();
    acts.setPivotal('place', true);
    acts.setPivotal('shipped', true);
    acts.setPivotal('gone', true);
    expect(commit).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalledTimes(3);
    expect(debugLog).toHaveBeenCalledWith('[structure] refused', { reason: 'unchanged' });
  });

  it('writes nothing for a session that may not change the structure', () => {
    const { acts, commit } = setup(true);
    acts.setPivotal('placed', true);
    acts.saveAnswer('why', 'Because.');
    expect(commit).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalledWith('[structure] refused', { reason: 'blocked' });
  });
});

describe('useStructureActions: hotspot answers', () => {
  it('keeps an answer on a hotspot in one commit, and never logs the words', () => {
    const { acts, commit, el } = setup();
    acts.saveAnswer('why', '  Because the pass is full.  ');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(answerOf(el('why'))).toBe('Because the pass is full.');
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'HotspotAnswered');
    expect(debugLog).toHaveBeenCalledWith('[structure] answered', { open: false });
  });

  it('reopens the question when the answer is emptied, counting no answer', () => {
    const { acts, commit, el } = setup();
    acts.saveAnswer('who', '   ');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(answerOf(el('who'))).toBe('');
    expect(track).not.toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalledWith('[structure] answered', { open: true });
  });

  it('refuses the same answer again and a note that is no hotspot', () => {
    const { acts, commit } = setup();
    acts.saveAnswer('who', 'The chef.');
    acts.saveAnswer('placed', 'An answer.');
    expect(commit).not.toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalledTimes(2);
  });
});
