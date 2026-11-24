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
