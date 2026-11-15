import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGE_PATTERN_PITCH, pageFillTone, pageIsDark, pagePatternInk } from './page-fill-tone';

const valueImports = (file: string) =>
  [
    ...readFileSync(join(__dirname, file), 'utf8').matchAll(
      /^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms,
    ),
  ].map((match) => match[1]);

// docs/specs/016-platform/web-performance.md "Nothing heavy in what every route ships": a form's cover band paints
// a fill and its pattern, and needs neither the page's export frame nor the elements on it.
describe('page-fill-tone', () => {
  it('knows no element: it imports the colour maths and the picture tone alone', () => {
    expect(valueImports('page-fill-tone.ts')).toEqual(['./colour-math', './page-image']);
    expect(valueImports('page-image.ts')).toEqual(['./image-credit']);
    expect(valueImports('image-credit.ts')).toEqual([]);
  });

  it('reads a gradient as its two stops averaged', () => {
    expect(pageFillTone({ kind: 'gradient', from: '#000', to: '#ffffff', angle: 0 })).toBe(
      '#808080',
    );
  });

  it('inks a pattern faint white on a dark fill and faint slate on a light one or the paper', () => {
    expect(pageIsDark({ background: { fill: { kind: 'solid', color: '#0f172a' } } })).toBe(true);
    expect(pagePatternInk({ fill: { kind: 'solid', color: '#0f172a' } })).toBe(
      'rgb(255 255 255 / 0.14)',
    );
    expect(pagePatternInk({ fill: { kind: 'solid', color: '#fef3c7' } })).toBe(
      'rgb(15 23 42 / 0.1)',
    );
    expect(pagePatternInk(undefined)).toBe('rgb(15 23 42 / 0.1)');
    expect(PAGE_PATTERN_PITCH).toBe(24);
  });
});
