import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// docs/specs/034-text-documents/objects.md "Not listed", "Never counted": every list of a document's tabs, and every
// rule that counts them, reads them through `listedTabs` (or a rule built on it), so a text document's drawing tabs
// never show. A list that stops doing so fails here.

const APP = join(__dirname, '..');

// Each list or count, and what it reads the tabs through.
const TAB_LISTS: readonly { file: string; reads: string; what: string }[] = [
  {
    file: 'app/document/[id]/EditorView.tsx',
    reads: 'listedTabs(',
    what: 'the tab strip, list, embed switcher',
  },
  { file: 'components/split/SplitViewFrame.tsx', reads: 'listedTabs(', what: 'Side by Side' },
  {
    file: 'components/dialogs/EditorElementDialogs.tsx',
    reads: 'listedTabs(',
    what: 'the link picker',
  },
  {
    file: 'components/dialogs/EditorTabDialogs.tsx',
    reads: 'listedTabs(',
    what: 'a share’s tab scope',
  },
  {
    file: 'components/plan/dashboard/DashboardLinksCard.tsx',
    reads: 'listedTabs(',
    what: 'a Links card',
  },
  {
    file: 'components/canvas/tab-window/TabWindowTabList.tsx',
    reads: 'tabWindowOffers(',
    what: 'Choose a Tab',
  },
  { file: 'lib/tab-deletion.ts', reads: 'listedTabs(', what: 'the last tab' },
  { file: 'hooks/persistence/useTabActions.ts', reads: 'listedTabs(', what: 'Delete' },
  {
    file: 'app/document/[id]/seed-fetched-document.ts',
    reads: 'listedTabs(',
    what: 'the first tab',
  },
];

describe('tab lists leave drawing tabs out', () => {
  it.each(TAB_LISTS)('$what reads the tabs through $reads', ({ file, reads }) => {
    expect(readFileSync(join(APP, file), 'utf8')).toContain(reads);
  });
});
