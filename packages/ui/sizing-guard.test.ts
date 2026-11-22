import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkSizing, formatSizingViolations } from '@livedoc/tailwind-config/sizing-guard';

// The shared parts that have moved to the sizing scale (docs/specs/004-interface-design/sizing.md "The guard").
const SIZED_PATHS = [
  'src/Button.tsx',
  'src/TextInput.tsx',
  'src/Select.tsx',
  'src/menu/menu-classes.ts',
  'src/ModeFilterMenu.tsx',
  'src/dialog',
  'src/hint/HintSurface.tsx',
  'src/HoverCard.tsx',
];

describe('ui sizing', () => {
  it('draws every moved shared part from the sizing scale', () => {
    const root = fileURLToPath(new URL('.', import.meta.url));
    expect(formatSizingViolations(checkSizing({ root, paths: SIZED_PATHS }))).toBe('');
  });
});
