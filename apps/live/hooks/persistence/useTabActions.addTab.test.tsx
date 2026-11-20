// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';
import { track } from '@/lib/telemetry';
import { clearPlanStartLandings, takePlanStartLanding } from '@/lib/plan-start-landing';
import type { AddTabChoice } from '@/lib/new-tab-seed';
import { useTabActions } from './useTabActions';

// docs/specs/007-editor/editor-modes.md "+ adds a tab or a Plan tab".
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

afterEach(() => {
  clearPlanStartLandings();
  vi.mocked(track).mockClear();
});

const first = { id: 't1', name: 'Tab 1', elements: [] } as unknown as Tab;

function run(choice?: AddTabChoice, canEditStructure = true, active: Tab = first) {
  const commitTabs = vi.fn();
  const deps = new Proxy<Record<string, unknown>>(
    {
      tabs: [active],
      activeId: 't1',
      canEditStructure,
      createTab: (name: string) => ({ id: 't2', name, elements: [] }) as unknown as Tab,
      commitTabs,
    },
    // Every other dependency the hook takes is a no-op here.
    { get: (target, key: string) => (key in target ? target[key] : vi.fn()) },
  );
  const { result } = renderHook(() => useTabActions(deps as never));
  result.current.addTab(choice);
  return { commitTabs };
}

function add(choice?: AddTabChoice, active: Tab = first) {
  const { commitTabs } = run(choice, true, active);
  const update = commitTabs.mock.calls[0]![0] as (ts: Tab[]) => Tab[];
  return update([active]).at(-1)!;
}

describe('adding a Tab', () => {
  it('from Structured, opens on Start Diagramming: no opening mode', () => {
    expect(add().opensIn).toBeUndefined();
    expect(add('tab').opensIn).toBeUndefined();
  });

  it('from Pages or Sketch, opens in that same mode on its own start', () => {
    for (const mode of ['pages', 'draw'] as const)
      expect(add('tab', { ...first, opensIn: mode }).opensIn).toBe(mode);
  });

  it('from a Plan tab, opens in Structured, a general tab carrying its look, never its kind', () => {
    const board = { ...first, kind: 'board', theme: 'slate' } as unknown as Tab;
    const added = add('tab', board);
    expect(added).toMatchObject({ theme: 'slate' });
    expect(added.opensIn).toBeUndefined();
    expect(added.kind).toBeUndefined();
  });

  it('counts as a plain Tab · Created', () => {
    add('tab');
    expect(track).toHaveBeenCalledWith('Tab', 'Created');
  });
});

describe('adding a Board, Sheet or Dashboard', () => {
  it.each([
    ['board', 'boards', 'Board'],
    ['sheet', 'sheets', 'Sheet'],
    ['dashboard', 'dashboards', 'Dashboard'],
  ] as const)('a %s opens a Plan start landing on %s', (choice, landing, type) => {
    const added = add(choice, { ...first, opensIn: 'draw' });
    expect(added.opensIn).toBe('plan');
    expect(added.kind).toBeUndefined();
    expect(takePlanStartLanding(added.id)).toBe(landing);
    expect(track).toHaveBeenCalledWith('Tab', 'Created', type);
  });
});

// docs/specs/013-workspace/tab-scoped-share-links.md: a tab-scoped (or view) link changes no tabs, so whichever
// row asks, no tab is added.
describe('adding a tab without the right to change tabs', () => {
  it('adds nothing, whichever row', () => {
    for (const choice of ['tab', 'board', 'sheet', 'dashboard'] as const)
      expect(run(choice, false).commitTabs).not.toHaveBeenCalled();
  });
});

// docs/specs/006-document/kinds-outside-the-canvas.md "The tab strip": Text document adds a text document tab, born
// ODF, carrying no canvas look or mode.
describe('adding a Text document', () => {
  it('adds a text document tab named Text document, born ODF', () => {
    const added = add('text-document', { ...first, opensIn: 'draw', theme: 'slate' });
    expect(added).toEqual({
      id: 't2',
      name: 'Text document',
      kind: 'text-document',
      format: 'odf',
      elements: [],
    });
    expect(track).toHaveBeenCalledWith('Tab', 'Created', 'TextDocument');
  });

  it('adds none for a session that cannot change the tabs', () => {
    expect(run('text-document', false).commitTabs).not.toHaveBeenCalled();
  });
});
