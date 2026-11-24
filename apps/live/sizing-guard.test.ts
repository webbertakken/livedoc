import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkSizing, formatSizingViolations } from '@livedoc/tailwind-config/sizing-guard';

const root = fileURLToPath(new URL('.', import.meta.url));

// The editor's parts that have moved to the sizing scale (docs/specs/004-interface-design/sizing.md "The guard").
const SIZED_PATHS = [
  'components/primitives',
  'components/colour',
  'components/drive',
  'components/placement',
  'components/split',
  'components/bug-report',
  'components/tags',
  'components/toast',
  'components/tour',
  'components/dialogs',
  'app/explorer',
  'app/new',
  'components/start',
  'components/panels',
  'components/canvas/ImageDropZone.tsx',
];

describe('live sizing', () => {
  it('draws every moved part from the sizing scale', () => {
    expect(formatSizingViolations(checkSizing({ root, paths: SIZED_PATHS }))).toBe('');
  });
});
