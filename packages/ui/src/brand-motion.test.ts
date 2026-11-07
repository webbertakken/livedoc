import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./brand-motion.css', import.meta.url), 'utf8');

// docs/specs/004-interface-design/brand-mark.md.
describe('brand-motion.css', () => {
  it('assembles only logos that ask, and only before the page is marked assembled', () => {
    const selectors = [...css.matchAll(/([^{}]+)\{[^{}]*animation:/g)].map((m) => m[1]!.trim());
    expect(selectors.length).toBeGreaterThan(0);
    for (const s of selectors) {
      expect(s).toContain('html:not([data-brand-assembled])');
      expect(s).toContain('[data-assemble]');
    }
  });

  it('fills backwards, so the static HTML paints the first frame', () => {
    const animations = [...css.matchAll(/animation:([^;]+);/g)].map((m) => m[1]!);
    for (const a of animations.filter((a) => a.trim() !== 'none')) expect(a).toContain('backwards');
  });

  it('only fades the mark in under reduced motion', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain('ldm-fade-in');
    expect(reduced).toContain('animation: none');
    expect(reduced).toMatch(/\[data-assemble\] \[data-mark-art\] \{\s*animation: ldm-fade-in/);
  });

  it('never moves the wordmark: only the mark assembles', () => {
    expect(css).not.toContain('data-logotype');
  });
});
