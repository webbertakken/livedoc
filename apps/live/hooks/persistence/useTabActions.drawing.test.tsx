// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';
import { useTabActions } from './useTabActions';

// docs/specs/034-text-documents/objects.md "A drawing tab", "Inserting and editing": Insert > Drawing > New adds an
// empty drawing tab of the text document tab, named Drawing N, in Structured mode, and opens it.
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

let next = 0;
const createTab = (name: string): Tab => ({ id: `new-${++next}`, name, elements: [] });

function adding(tabs: Tab[], canEditStructure = true) {
  const commitTabs = vi.fn();
  const setActiveId = vi.fn();
  const deps = new Proxy<Record<string, unknown>>(
    { tabs, activeId: 'w', commitTabs, setActiveId, createTab, canEditStructure },
    { get: (target, key: string) => (key in target ? target[key] : vi.fn()) },
  );
  const { result } = renderHook(() => useTabActions(deps as never));
  const id = result.current.addDrawingTab('w');
  const update = commitTabs.mock.calls[0]?.[0] as ((ts: Tab[]) => Tab[]) | undefined;
  return { id, after: update?.(tabs), setActiveId };
}

describe('adding a drawing tab', () => {
  const text: Tab = { id: 'w', name: 'Notes', kind: 'text-document', elements: [] };

  it('adds the next Drawing N of the text document, in Structured mode, and opens it', () => {
    const { id, after, setActiveId } = adding([
      text,
      { id: 'd', name: 'Drawing 2', drawingOf: 'w', elements: [] },
    ]);
    const added = after!.at(-1)!;
    expect(added).toMatchObject({ id, name: 'Drawing 3', drawingOf: 'w', elements: [] });
    expect(added).not.toHaveProperty('opensIn');
    expect(added).not.toHaveProperty('kind');
    expect(setActiveId).toHaveBeenCalledWith(id);
  });

  it('adds none for a session that may not change the document’s tabs', () => {
    const { id, after } = adding([text], false);
    expect(id).toBeNull();
    expect(after).toBeUndefined();
  });
});

// objects.md "One drawing, one picture": a drawing's own copy, a new drawing tab with its elements under fresh ids;
// "Deleting": drawing tabs no picture names, dropped in one change.
function acting(tabs: Tab[], { canEditStructure = true, loaded = true } = {}) {
  const commitTabs = vi.fn();
  const markTabLoaded = vi.fn();
  const setActiveId = vi.fn();
  const deps = new Proxy<Record<string, unknown>>(
    {
      tabs,
      activeId: 'w',
      commitTabs,
      setActiveId,
      markTabLoaded,
      isTabLoaded: () => loaded,
      createTab,
      canEditStructure,
    },
    { get: (target, key: string) => (key in target ? target[key] : vi.fn()) },
  );
  const { result } = renderHook(() => useTabActions(deps as never));
  const after = () => (commitTabs.mock.calls[0]?.[0] as ((ts: Tab[]) => Tab[]) | undefined)?.(tabs);
  return { actions: result.current, after, markTabLoaded, setActiveId, commitTabs };
}

describe('copying a drawing tab', () => {
  const text: Tab = { id: 'w', name: 'Notes', kind: 'text-document', elements: [] };
  const source: Tab = {
    id: 'd1',
    name: 'Drawing 1',
    drawingOf: 'v',
    elements: [
      { id: 'e1', type: 'shape', shape: 'rectangle', x: 0, y: 0, width: 10, height: 10 } as never,
    ],
  };
  const later: Tab = { id: 'z', name: 'Later', elements: [] };

  it('adds the next Drawing N of this text document after the source, its elements under fresh ids, unopened', () => {
    const { actions, after, markTabLoaded, setActiveId } = acting([text, source, later]);
    const id = actions.copyDrawingTab('d1', 'w');
    const tabs = after()!;
    expect(tabs.map((t) => t.id)).toEqual(['w', 'd1', id, 'z']);
    const copy = tabs[2]!;
    expect(copy).toMatchObject({ name: 'Drawing 1', drawingOf: 'w' });
    expect(copy.elements).toHaveLength(1);
    expect(copy.elements[0]!.id).not.toBe('e1');
    expect(markTabLoaded).toHaveBeenCalledWith(id);
    expect(setActiveId).not.toHaveBeenCalled();
  });

  it('copies nothing from a source not here or not loaded, or for a session that may not change tabs', () => {
    expect(acting([text, source]).actions.copyDrawingTab('none', 'w')).toBeNull();
    expect(acting([text, source], { loaded: false }).actions.copyDrawingTab('d1', 'w')).toBeNull();
    const refused = acting([text, source], { canEditStructure: false });
    expect(refused.actions.copyDrawingTab('d1', 'w')).toBeNull();
    expect(refused.commitTabs).not.toHaveBeenCalled();
  });
});

describe('removing drawing tabs', () => {
  const tabs: Tab[] = [
    { id: 'w', name: 'Notes', kind: 'text-document', elements: [] },
    { id: 'd1', name: 'Drawing 1', drawingOf: 'w', elements: [] },
    { id: 'd2', name: 'Drawing 2', drawingOf: 'w', elements: [] },
  ];

  it('drops the drawing tabs named in one change, never another tab', () => {
    const { actions, after, commitTabs } = acting(tabs);
    actions.removeDrawingTabs(['d1', 'w', 'none']);
    expect(commitTabs).toHaveBeenCalledTimes(1);
    expect(after()!.map((t) => t.id)).toEqual(['w', 'd2']);
  });

  it('changes nothing with no drawing tab named, or for a session that may not change tabs', () => {
    const none = acting(tabs);
    none.actions.removeDrawingTabs(['w']);
    expect(none.commitTabs).not.toHaveBeenCalled();
    const refused = acting(tabs, { canEditStructure: false });
    refused.actions.removeDrawingTabs(['d1']);
    expect(refused.commitTabs).not.toHaveBeenCalled();
  });
});
