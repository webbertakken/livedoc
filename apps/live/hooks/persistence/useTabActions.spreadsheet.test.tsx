// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';
import { useTabActions } from './useTabActions';

// docs/specs/029-sheets/spreadsheet.md "The workbook shape": a spreadsheet holds only sheets, so the canvas's tab
// actions say so and change nothing.
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
const linkTab = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  apiLinkTab: linkTab,
}));

const sheet = { id: 't1', name: 'Sheet1', kind: 'sheet', elements: [] } as unknown as Tab;

function hook() {
  const commitTabs = vi.fn();
  const toast = { error: vi.fn(), success: vi.fn(), info: vi.fn() };
  const deps = new Proxy<Record<string, unknown>>(
    {
      tabs: [sheet],
      activeId: 't1',
      canEditStructure: true,
      spreadsheet: true,
      isTabLoaded: () => true,
      createTab: (name: string) => ({ id: 't2', name, elements: [] }) as unknown as Tab,
      commitTabs,
      toast,
    },
    { get: (target, key: string) => (key in target ? target[key] : vi.fn()) },
  );
  const { result } = renderHook(() => useTabActions(deps as never));
  return { actions: result.current, commitTabs, toast };
}

describe('tab actions in a spreadsheet', () => {
  it.each([
    ['adding a tab', (a: ReturnType<typeof hook>['actions']) => a.addTab('board')],
    ['duplicating a tab', (a: ReturnType<typeof hook>['actions']) => a.duplicateTab('t1')],
    [
      'copying a tab to another document',
      (a: ReturnType<typeof hook>['actions']) => void a.linkActiveTabTo('other'),
    ],
  ])('refuses %s, saying why', (_, act) => {
    const { actions, commitTabs, toast } = hook();
    act(actions);
    expect(commitTabs).not.toHaveBeenCalled();
    expect(linkTab).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('A spreadsheet holds only sheets.');
  });
});

describe('importing into a sheet tab', () => {
  it('refuses, since a sheet tab has no canvas to replace; the import dialog says why', async () => {
    const { actions, commitTabs } = hook();
    expect(await actions.importTextIntoActiveTab('markdown', '# Notes')).toEqual({
      status: 'error',
      error: 'A spreadsheet holds only sheets.',
    });
    expect(commitTabs).not.toHaveBeenCalled();
  });
});
