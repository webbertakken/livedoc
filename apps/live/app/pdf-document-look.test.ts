import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@livedoc/document';
import { DarkPages } from '@livedoc/pdf-documents';

// docs/specs/035-pdf-documents/reading-surface.md "Colours": the PDF's chrome is the shell's tokens only; what LiveDoc
// draws on a page is the PDF's own paper tokens, the same in both schemes, each pair at its contrast.

const CSS = readFileSync(fileURLToPath(new URL('./pdf-document.css', import.meta.url)), 'utf8');
/** The tokens one block of the sheet sets, by name. */
const tokensOf = (block: string): Record<string, string> =>
  Object.fromEntries(
    [...block.matchAll(/--pdf-([\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1]!, m[2]!]),
  );
const DARK_AT = CSS.indexOf("[data-pdf-look='dark']");
const pdf = tokensOf(CSS.slice(0, DARK_AT));
const dark = tokensOf(CSS.slice(DARK_AT));
const COMPONENTS = fileURLToPath(new URL('../components/pdf-document/', import.meta.url));

describe('the PDF’s own colours', () => {
  it('writes LiveDoc’s words on the paper at 4.5:1', () => {
    expect(pdf.paper).toBe('#ffffff');
    expect(contrastRatio(pdf['paper-ink']!, pdf.paper!)).toBeGreaterThanOrEqual(4.5);
  });

  it('tints the current find result darker than the rest, both still letting black text read at 4.5:1', () => {
    expect(contrastRatio(pdf['found-current']!, pdf.paper!)).toBeGreaterThan(
      contrastRatio(pdf.found!, pdf.paper!),
    );
    for (const tint of [pdf.found!, pdf['found-current']!, pdf['mark-preview']!])
      expect(contrastRatio('#000000', tint)).toBeGreaterThanOrEqual(4.5);
  });

  // dark-pages.md "The recolouring": what LiveDoc draws on a Dark page is its paper colour as the step shows it.
  it('shows each token under Dark pages as the step shows its paper colour, words still at 4.5:1', () => {
    expect(Object.keys(dark).toSorted()).toEqual(Object.keys(pdf).toSorted());
    for (const [name, colour] of Object.entries(pdf))
      expect(dark[name], name).toBe(DarkPages.hex(colour));
    expect(contrastRatio(dark['paper-ink']!, dark.paper!)).toBeGreaterThanOrEqual(4.5);
  });

  it('is the only colour the PDF’s components name: the rest is the shell’s tokens', () => {
    const raw =
      /\b(?:bg|text|fill|stroke|outline|border|ring|decoration|from|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b|#[0-9a-fA-F]{3,8}\b/;
    const offenders = readdirSync(COMPONENTS)
      .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
      .flatMap((file) =>
        readFileSync(COMPONENTS + file, 'utf8')
          .split('\n')
          .map((line, at) => [`${file}:${at + 1}`, line] as const)
          .filter(([, line]) => raw.test(line))
          .map(([where]) => where),
      );
    expect(offenders).toEqual([]);
  });
});
