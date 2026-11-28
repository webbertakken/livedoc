// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';
import { usePlanImageExport } from './usePlanImageExport';

// docs/specs/026-plan/plan-tabs.md "Export": the image waits for the Sheets it draws, and a read that fails still
// lets the export go ahead, the Sheets drawn as frames.

const read = vi.hoisted(() => ({
  models: vi.fn(),
  contents: vi.fn(() => new Map()),
  pictures: vi.fn(() => new Map<string, string>()),
}));
vi.mock('@/components/plan/PlanContext', () => ({ usePlan: () => null }));
vi.mock('@/hooks/sheets/useSheetsBridge', () => {
  const bridge = { locale: 'en' };
  return { useSheetsBridgeContext: () => bridge };
});
vi.mock('@/lib/export-tab', () => ({ renderTabToSvg: () => '<svg/>' }));
vi.mock('@/components/sheets/sheet-store-client', () => ({
  sheetStoreOf: () => ({ loadTab: async () => {} }),
}));
vi.mock('@/lib/export-plan/plan-export-sheets', () => ({
  sheetTabsToLoad: () => ['t'],
  sheetModelsFor: read.models,
  sheetMetricsFor: () => new Map(),
  spreadsheetPicturesFor: read.pictures,
  linkedChartsFor: () => new Map(),
  sheetContentsFor: read.contents,
}));

const sheet = {
  id: 's',
  type: 'shape',
  shape: 'plan-sheet',
  x: 0,
  y: 0,
  width: 400,
  height: 300,
  planSheet: { sheetId: 'a1b2c3d4e5f60718' },
};
const tab = { id: 't', name: 'Budget', kind: 'sheet', elements: [sheet] } as unknown as Tab;

describe('usePlanImageExport', () => {
  it('is ready once the Sheets are read', async () => {
    read.models.mockReturnValue(new Map());
    const { result } = renderHook(() => usePlanImageExport(tab, [tab]));
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('grows a Sheet to its filled cells, then reads its cells again for the grown frame before it is ready', async () => {
    read.models.mockReturnValue(new Map());
    // Cells reaching past the frame (sheetContentSize): 900 wide, 500 tall, from the grid's corner.
    read.contents.mockReturnValue(new Map([['a1b2c3d4e5f60718', { width: 900, height: 500 }]]));
    const { result } = renderHook(() => usePlanImageExport(tab, [tab]));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const grown = result.current.imageTab.elements[0] as { width: number; height: number };
    expect(grown.width).toBeGreaterThan(900);
    expect(grown.height).toBeGreaterThan(500);
    // The last read framed the grown Sheet, so its cells fill it.
    const framed = read.models.mock.calls.at(-1)![0] as { width: number }[];
    expect(framed[0]!.width).toBe(grown.width);
    read.contents.mockReturnValue(new Map());
  });

  // docs/specs/029-sheets/plan-links.md "The Spreadsheet slot": the picture the page last read.
  it('draws a Spreadsheet slot’s last read picture on a Dashboard’s image', async () => {
    read.models.mockReturnValue(new Map());
    read.pictures.mockReturnValue(
      new Map([
        [
          's1',
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><rect id="pic"/></svg>',
        ],
      ]),
    );
    const dashboard = {
      id: 'd',
      name: 'Overview',
      kind: 'dashboard',
      elements: [],
      dashboard: {
        rows: [
          {
            id: 'r',
            height: 320,
            slots: [{ id: 's1', span: 12, content: { type: 'spreadsheet', documentId: 'book1' } }],
          },
        ],
      },
    } as unknown as Tab;
    const { result } = renderHook(() => usePlanImageExport(dashboard, [dashboard]));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await waitFor(() =>
      expect(result.current.opts.resolvePlanArt?.({ id: 'export-slot-s1' } as never)).toContain(
        'id="pic"',
      ),
    );
    read.pictures.mockReturnValue(new Map());
  });

  it('settles when reading the Sheets fails, never holding the export', async () => {
    read.models.mockImplementation(() => {
      throw new Error('engine');
    });
    const { result } = renderHook(() => usePlanImageExport(tab, [tab]));
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('reads a malformed stored Dashboard as one with nothing on it, never throwing', () => {
    for (const dashboard of [{ rows: [{ fill: true }] }, {}]) {
      const bad = { id: 'd', name: 'Overview', kind: 'dashboard', elements: [], dashboard };
      const t = bad as unknown as Tab;
      expect(() => renderHook(() => usePlanImageExport(t, [t]))).not.toThrow();
    }
  });
});
