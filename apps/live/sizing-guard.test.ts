import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkSizing, formatSizingViolations } from '@livedoc/tailwind-config/sizing-guard';

// The editor's parts that have moved to the sizing scale (docs/specs/004-interface-design/sizing.md "The guard").
const SIZED_PATHS = [
  'components/primitives',
  'app/explorer/ExplorerShell.tsx',
  'app/explorer/PaneHeader.tsx',
  'app/explorer/sidebar',
  'app/explorer/SectionsDrawer.tsx',
  'app/explorer/ViewToggle.tsx',
  'app/explorer/ImportFromToolbar.tsx',
  'app/explorer/ExplorerEmptyState.tsx',
  'app/explorer/details',
  'app/explorer/explorer-route-document-row.tsx',
  'app/explorer/folder-row.tsx',
  'app/explorer/document-badges.tsx',
];

describe('live sizing', () => {
  it('draws every moved part from the sizing scale', () => {
    const root = fileURLToPath(new URL('.', import.meta.url));
    expect(formatSizingViolations(checkSizing({ root, paths: SIZED_PATHS }))).toBe('');
  });
});
