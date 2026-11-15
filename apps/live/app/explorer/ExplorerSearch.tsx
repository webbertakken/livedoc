'use client';

// The Explorer's search with what it searches: the panel, the help registry and the settings catalogue are one
// piece of code, loaded for the search and never with the Explorer (docs/specs/016-platform/web-performance.md
// "A surface that is not on screen loads when it is").
import type { ComponentProps } from 'react';
import { SearchPanel } from '@/components/panels/SearchPanel';
import { HELP_SEARCH_ITEMS } from '@/lib/help-search';
import type { SettingSearchItem } from '@/lib/search';
import { SETTINGS_SEARCH_ITEMS } from '@/lib/settings-search-items';

const NO_SETTINGS: SettingSearchItem[] = [];

type ExplorerSearchProps = Omit<
  ComponentProps<typeof SearchPanel>,
  'helpItems' | 'settingItems'
> & {
  // Whether this surface has Settings to find (a workspace frame's Explorer has none).
  settings: boolean;
};

export function ExplorerSearch({ settings, ...panel }: ExplorerSearchProps) {
  return (
    <SearchPanel
      {...panel}
      helpItems={HELP_SEARCH_ITEMS}
      settingItems={settings ? SETTINGS_SEARCH_ITEMS : NO_SETTINGS}
    />
  );
}
