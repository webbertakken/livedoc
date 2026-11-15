// @vitest-environment jsdom
import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ panel: vi.fn((_props: Record<string, unknown>) => null) }));
vi.mock('@/components/panels/SearchPanel', () => ({ SearchPanel: mocks.panel }));

import { HELP_SEARCH_ITEMS } from '@/lib/help-search';
import { SETTINGS_SEARCH_ITEMS } from '@/lib/settings-search-items';
import { ExplorerSearch } from './ExplorerSearch';

const sources = {
  documents: [],
  folders: [],
  onSelectDocument: () => {},
  onSelectFolder: () => {},
  onClose: () => {},
} as unknown as Omit<ComponentProps<typeof ExplorerSearch>, 'settings'>;

const panelProps = () => mocks.panel.mock.calls.at(-1)?.[0] ?? {};

describe('ExplorerSearch', () => {
  beforeEach(() => mocks.panel.mockClear());

  it('searches every help article and every setting', () => {
    render(<ExplorerSearch {...sources} settings />);

    expect(panelProps().helpItems).toBe(HELP_SEARCH_ITEMS);
    expect(panelProps().settingItems).toBe(SETTINGS_SEARCH_ITEMS);
  });

  it('finds no setting on a surface without Settings, and hands the panel the same empty list each time', () => {
    const { rerender } = render(<ExplorerSearch {...sources} settings={false} />);
    const first = panelProps().settingItems;
    rerender(<ExplorerSearch {...sources} settings={false} />);

    expect(first).toEqual([]);
    expect(panelProps().settingItems).toBe(first);
    expect(panelProps().helpItems).toBe(HELP_SEARCH_ITEMS);
  });

  it('passes the Explorer’s sources and handlers through', () => {
    render(<ExplorerSearch {...sources} settings />);

    expect(panelProps().onClose).toBe(sources.onClose);
    expect(panelProps().documents).toBe(sources.documents);
  });
});
