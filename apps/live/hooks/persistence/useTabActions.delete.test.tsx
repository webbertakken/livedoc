// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';
import { useTabActions } from './useTabActions';

// docs/specs/034-text-documents/objects.md "Deleting", "Never counted": a text document tab's drawing tabs go with it in
// the same commit (one undo step), and they never count as another tab.
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const tab = (id: string, over: Partial<Tab> = {}): Tab => ({ id, name: id, elements: [], ...over });

function deleting(tabs: Tab[], id: string, activeId = id) {
  const commitTabs = vi.fn();
  const setActiveId = vi.fn();
  const deps = new Proxy<Record<string, unknown>>(
    { tabs, activeId, commitTabs, setActiveId, isTabLoaded: () => true },
    { get: (target, key: string) => (key in target ? target[key] : vi.fn()) },
  );
  const { result } = renderHook(() => useTabActions(deps as never));
  result.current.deleteTab(id);
  const update = commitTabs.mock.calls[0]?.[0] as ((ts: Tab[]) => Tab[]) | undefined;
  return { commits: commitTabs.mock.calls.length, after: update?.(tabs), setActiveId };
}

describe('deleting a text document tab', () => {
  it('takes its drawing tabs along in one commit, leaving others’ drawings', () => {
    const tabs = [
      tab('b'),
      tab('w', { kind: 'text-document' }),
      tab('d1', { drawingOf: 'w' }),
      tab('v', { kind: 'text-document' }),
      tab('d2', { drawingOf: 'v' }),
    ];
    const { commits, after, setActiveId } = deleting(tabs, 'w');
    expect(commits).toBe(1);
    expect(after!.map((t) => t.id)).toEqual(['b', 'v', 'd2']);
    expect(setActiveId).toHaveBeenCalledWith('v');
  });

  it('never deletes the one listed tab, whatever drawings it holds', () => {
    const tabs = [tab('w', { kind: 'text-document' }), tab('d1', { drawingOf: 'w' })];
    expect(deleting(tabs, 'w').commits).toBe(0);
  });
});

describe('deleting a drawing tab', () => {
  it('goes back to its text document tab when it was open', () => {
    const tabs = [tab('b'), tab('w', { kind: 'text-document' }), tab('d1', { drawingOf: 'w' })];
    const { after, setActiveId } = deleting(tabs, 'd1');
    expect(after!.map((t) => t.id)).toEqual(['b', 'w']);
    expect(setActiveId).toHaveBeenCalledWith('w');
  });
});
