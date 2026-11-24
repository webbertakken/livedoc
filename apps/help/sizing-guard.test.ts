import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkSizing, formatSizingViolations } from '@livedoc/tailwind-config/sizing-guard';

const root = fileURLToPath(new URL('.', import.meta.url));

// The help centre's chrome is on the sizing scale (docs/specs/004-interface-design/sizing.md "The other apps").
const SIZED_PATHS = ['app', 'components', 'lib'];

// The category pictures and the article illustrations (pictures of the editor) are drawn art.
// The home page's hero headline is display type, as the marketing site's (D243).
const SIZING_EXCEPTIONS = [
  'components/category-art',
  'components/illustrations',
  'components/HelpHero.tsx',
];

describe('help sizing', () => {
  it('draws every part from the sizing scale', () => {
    expect(
      formatSizingViolations(checkSizing({ root, paths: SIZED_PATHS, except: SIZING_EXCEPTIONS })),
    ).toBe('');
  });
});
