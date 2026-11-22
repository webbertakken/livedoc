import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkSizing, formatSizingViolations } from '@livedoc/tailwind-config/sizing-guard';

// The editor's parts that have moved to the sizing scale (docs/specs/004-interface-design/sizing.md "The guard").
const SIZED_PATHS = [
  'components/primitives/PortalMenu.tsx',
  'components/primitives/MenuCheckRow.tsx',
  'components/primitives/MovablePanelHeader.tsx',
  'components/primitives/EllipsisTriggerButton.tsx',
  'components/primitives/SettingsPopover.tsx',
  'components/primitives/BackBar.tsx',
  'components/primitives/SearchInput.tsx',
  'components/primitives/FilterSearchBox.tsx',
  'components/primitives/AccordionSection.tsx',
  'components/primitives/ConfirmPopover.tsx',
  'components/primitives/MentionMenu.tsx',
  'components/primitives/MenuFlyoutPanel.tsx',
  'components/primitives/MenuFlyoutSection.tsx',
  'components/primitives/MenuSliderRow.tsx',
  'components/primitives/MenuTiles.tsx',
  'components/primitives/PreviewSliderRow.tsx',
  'components/primitives/NumberStepper.tsx',
  'components/primitives/ChipField.tsx',
  'components/primitives/SegmentedRadio.tsx',
  'components/primitives/HelpArticleLink.tsx',
];

describe('live sizing', () => {
  it('draws every moved part from the sizing scale', () => {
    const root = fileURLToPath(new URL('.', import.meta.url));
    expect(formatSizingViolations(checkSizing({ root, paths: SIZED_PATHS }))).toBe('');
  });
});
