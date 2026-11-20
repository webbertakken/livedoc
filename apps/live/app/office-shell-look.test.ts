import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@livedoc/document';

const CSS = readFileSync(fileURLToPath(new URL('./office-shell.css', import.meta.url)), 'utf8');

// The tokens of one block (`.office-shell` or `.dark .office-shell`), hex colours only.
function tokens(selector: string): Record<string, string> {
  const start = CSS.indexOf(`${selector} {`);
  const block = CSS.slice(start, CSS.indexOf('}', start));
  return Object.fromEntries(
    [...block.matchAll(/--office-([\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1]!, m[2]!]),
  );
}

// docs/specs/004-interface-design/office-shell.md "The look": every token pair meets WCAG 2.2 AA in both schemes.
describe.each([
  ['light', '.office-shell'],
  ['dark', '.dark .office-shell'],
])('the office look in %s', (_scheme, selector) => {
  const t = tokens(selector);

  it('holds text at 4.5:1 on every surface it sits on', () => {
    for (const ink of ['ink', 'muted', 'icon', 'error'])
      for (const ground of ['chrome', 'toolbar', 'menu', 'menu-hover', 'dialog'])
        expect(contrastRatio(t[ink]!, t[ground]!), `${ink} on ${ground}`).toBeGreaterThanOrEqual(
          4.5,
        );
    expect(contrastRatio(t['share-ink']!, t.share!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t['pressed-ink']!, t.pressed!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t['primary-ink']!, t.primary!)).toBeGreaterThanOrEqual(4.5);
    // A text button (Cancel) is drawn in the primary colour on the dialog.
    expect(contrastRatio(t.primary!, t.dialog!)).toBeGreaterThanOrEqual(4.5);
  });

  it('holds the focus ring at 3:1 on every surface', () => {
    for (const ground of ['chrome', 'toolbar', 'menu', 'menu-hover', 'dialog'])
      expect(contrastRatio(t.focus!, t[ground]!), `focus on ${ground}`).toBeGreaterThanOrEqual(3);
  });
});
