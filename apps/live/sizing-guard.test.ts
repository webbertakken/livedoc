import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkSizing, formatSizingViolations } from '@livedoc/tailwind-config/sizing-guard';

const root = fileURLToPath(new URL('.', import.meta.url));

// The Explorer's parts still to move to the scale (plan 0024, slice 3); everything else under it has moved.
const EXPLORER_NOT_YET_SIZED = new Set(['new-document']);
const EXPLORER_SIZED = readdirSync(`${root}app/explorer`)
  .filter((entry) => !EXPLORER_NOT_YET_SIZED.has(entry))
  .map((entry) => `app/explorer/${entry}`);

// The editor's parts that have moved to the sizing scale (docs/specs/004-interface-design/sizing.md "The guard").
const SIZED_PATHS = ['components/primitives', ...EXPLORER_SIZED];

describe('live sizing', () => {
  it('draws every moved part from the sizing scale', () => {
    expect(formatSizingViolations(checkSizing({ root, paths: SIZED_PATHS }))).toBe('');
  });
});
