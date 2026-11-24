import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkSizing, formatSizingViolations } from '@livedoc/tailwind-config/sizing-guard';

const root = fileURLToPath(new URL('.', import.meta.url));

// The telemetry dashboard is chrome throughout, so its whole source is on the sizing scale
// (docs/specs/004-interface-design/sizing.md "The guard").
const SIZED_PATHS = ['app'];

describe('telemetry sizing', () => {
  it('draws every part from the sizing scale', () => {
    expect(formatSizingViolations(checkSizing({ root, paths: SIZED_PATHS }))).toBe('');
  });
});
