import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveShapeColours } from './colors';
import { shade, tint } from './colour-math';

// docs/specs/016-platform/web-performance.md "Nothing heavy in what every route ships": the brand mark and a page's
// paint need a colour, not the element defaults, which carry every shape kind with them.
describe('colour-math', () => {
  it('knows no element: it imports the colour parser alone', () => {
    const src = readFileSync(join(__dirname, 'colour-math.ts'), 'utf8');
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((match) => match[1]);

    expect(imports).toEqual(['./css-colour']);
  });

  it('mixes the colours a customised tab derives for its new shapes', () => {
    const accent = '#0ea5e9';

    expect(deriveShapeColours(accent, '#ffffff')).toEqual({
      fill: tint(accent, 0.85),
      stroke: accent,
      text: shade(accent, 0.45),
    });
  });
});
