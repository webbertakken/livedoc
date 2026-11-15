// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ES_LANES,
  ES_NOTE_GAP,
  LANE_NAME_WIDTH,
  answerOf,
  isPivotalEvent,
  laneCentre,
  laneIndexAt,
  type BoxedElement,
  type Element,
  type Tab,
  type TextElement,
} from '@livedoc/document';
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

function setup(blocked = false, elements: Element[] = board) {
  let current = elements;
  const commit = vi.fn((mapper: (els: Element[]) => Element[]) => {
    current = mapper(current);
  });
  const added: { el: BoxedElement; cx: number; cy: number; edit: boolean }[] = [];
  const addBoxedAt = vi.fn(
    (
      cx: number,
      cy: number,
      make: (x: number, y: number) => BoxedElement,
      opts?: { edit?: boolean },
    ) => {
      added.push({ el: make(0, 0), cx, cy, edit: opts?.edit === true });
    },
  );
  const startEditing = vi.fn<(id: string) => void>();
  const acts = renderHook(() =>
    useStructureActions({
      activeTab: { id: 't', elements } as Tab,
      blocked,
      commit,
      addBoxedAt,
      startEditing,
    }),
  ).result.current;
  const el = (id: string) => current.find((e) => e.id === id)!;
  return { acts, commit, el, added, addBoxedAt, startEditing };
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

describe('useStructureActions: lane names', () => {
  // The notes above all stand on one lane, their left edges at 0: the wall's left edge.
  const laneY = laneCentre(laneIndexAt(100, ES_LANES), ES_LANES);
  it('adds a blank name left of the wall on the note’s lane, opened for typing', () => {
    const { acts, added, startEditing } = setup();
    acts.nameLane('place');
    expect(added).toHaveLength(1);
    const { el, cx, cy, edit } = added[0]!;
    const name = el as TextElement;
    expect(edit).toBe(true);
    expect(name.type).toBe('text');
    expect(name.label).toBe('');
    expect(name.textAlignX).toBe('right');
    // It wraps at its width and hugs its lines, so a name left blank goes as any empty text does.
    expect(name.sizing).toBe('wrap');
    // One gutter clear of the wall, on the lane's centre.
    expect(cx + name.width / 2).toBe(-ES_NOTE_GAP);
    expect(name.width).toBe(LANE_NAME_WIDTH);
    expect(cy).toBe(laneY);
    expect(startEditing).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'LaneNamed');
    expect(debugLog).toHaveBeenCalledWith('[structure] lane named', { existed: false });
  });

  it('opens the name the lane already has', () => {
    const named: Element[] = [
      ...board,
      { id: 'lane', type: 'text', x: -200, y: laneY - 16, width: 180, height: 32, label: 'Floor' },
    ];
    const { acts, addBoxedAt, startEditing } = setup(false, named);
    acts.nameLane('place');
    expect(addBoxedAt).not.toHaveBeenCalled();
    expect(startEditing).toHaveBeenCalledWith('lane');
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'LaneNamed');
    expect(debugLog).toHaveBeenCalledWith('[structure] lane named', { existed: true });
  });

  it('refuses anything that is no workshop note, and a session that may not change the structure', () => {
    const { acts, addBoxedAt } = setup();
    acts.nameLane('gone');
    expect(debugLog).toHaveBeenCalledWith('[structure] refused', { reason: 'unchanged' });
    const blocked = setup(true);
    blocked.acts.nameLane('place');
    expect(debugLog).toHaveBeenCalledWith('[structure] refused', { reason: 'blocked' });
    expect(addBoxedAt).not.toHaveBeenCalled();
    expect(blocked.addBoxedAt).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });
});
