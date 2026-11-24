// Writes packages/sheets/src/text/font-advances.ts (docs/specs/029-sheets/sheet.md "Row height", docs/specs/004-
// interface-design/fonts.md "In a Sheet"): each editor font's character widths, as Chromium draws the faces Google
// Fonts serves, and each served document family's, as Chromium draws its Fontsource files, so a sheet's lines break
// the same in every browser, in the api and in an export, with no DOM to measure. The numbers are facts about the fonts
// (all under the SIL Open Font Licence); no font file is kept. The editor fonts need the network. Run:
// pnpm --filter live fonts:advances
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { FONTS, googleFontsHref } from '../../../packages/document/src/fonts.ts';
import {
  DOCUMENT_DEFAULT_FONT,
  DOCUMENT_FONTS,
  DocumentFonts,
  servedFamily,
} from '../../../packages/document/src/document-fonts.ts';

// Printable ASCII, the characters the table holds; the engine works the rest out by kind (text-measure.ts).
const FIRST = 0x20;
const LAST = 0x7e;
// Measured at a thousand px: canvas advances come back in whole px, so each is a thousandth of an em.
const MEASURE_PX = 1000;
const WEIGHTS = { regular: 400, bold: 700 } as const;

// The editor fonts by id, then the served document families by name (a cell names either, formatting.md "Font").
const editorFonts = FONTS.map((f) => ({ id: f.id, family: /'([^']+)'/.exec(f.stack)![1]! }));
const served = DocumentFonts.served();
const families = [
  ...editorFonts,
  ...served.map((f) => ({ id: f.name, family: servedFamily(f.name) })),
];
// Where the page fetches the served faces from: answered from the Fontsource packages on disk, never the network.
const LOCAL = 'https://fonts.livedoc.invalid';
const fontsource = fileURLToPath(new URL('../node_modules/@fontsource/', import.meta.url));
// Printable ASCII is in each family's Latin subset; only the faces a family has are declared, so Chromium draws
// the rest as it would in the editor (a bold it synthesises).
const faces = served
  .flatMap((f) =>
    f.served.styles.map((style) => {
      const [weight, slant] = style.split('-');
      return `@font-face{font-family:"${servedFamily(f.name)}";font-style:${slant};font-weight:${weight};src:url("${LOCAL}/${f.served.id}/files/${f.served.id}-latin-${style}.woff2") format("woff2")}`;
    }),
  )
  .join('\n');

const browser = await chromium.launch({ args: ['--mute-audio'] });
const page = await browser.newPage();
await page.route(`${LOCAL}/**`, (route) =>
  route.fulfill({
    body: readFileSync(fontsource + new URL(route.request().url()).pathname.slice(1)),
    contentType: 'font/woff2',
    headers: { 'access-control-allow-origin': '*' },
  }),
);
await page.setContent(
  `<!doctype html><link rel="stylesheet" href="${googleFontsHref().replace(/&/g, '&amp;')}"><style>${faces}</style>`,
  { waitUntil: 'networkidle' },
);
const advances = await page.evaluate(
  async ({ families, weights, first, last, px }) => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    const out: Record<string, Record<string, number[]>> = {};
    for (const { id, family } of families) {
      out[id] = {};
      for (const [name, weight] of Object.entries(weights)) {
        const font = `${weight} ${px}px "${family}"`;
        // The face the stylesheet declares, never a font of the same name installed on this machine.
        if ((await document.fonts.load(font)).length === 0)
          throw new Error(`${family} ${weight} did not load`);
        ctx.font = font;
        const row: number[] = [];
        for (let code = first; code <= last; code++)
          // Rounded up, so a line is never measured narrower than it draws.
          row.push(Math.ceil((ctx.measureText(String.fromCharCode(code)).width * 1000) / px));
        out[id][name] = row;
      }
    }
    return out;
  },
  { families, weights: WEIGHTS, first: FIRST, last: LAST, px: MEASURE_PX },
);
// Each face's figure when tabular figures are asked for (`font-variant-numeric: tabular-nums`), as a sheet draws its
// numbers (sheet.md "The grid"); null for a face with no tabular figures, whose digits keep their own widths. Read
// from laid-out text, as a canvas cannot ask for the feature.
const tabular = await page.evaluate(
  async ({ families, weights }) => {
    const out: Record<string, Record<string, number | null>> = {};
    for (const { id, family } of families) {
      out[id] = {};
      for (const [name, weight] of Object.entries(weights)) {
        await document.fonts.load(`${weight} 100px "${family}"`);
        const advances = [...'0123456789'].map((digit) => {
          const span = document.createElement('span');
          span.style.cssText = `position:absolute;white-space:pre;font:${weight} 100px "${family}";font-variant-numeric:tabular-nums`;
          span.textContent = digit.repeat(10);
          document.body.append(span);
          // Ten figures at 100 px: the width in px is one figure's advance in thousandths of an em.
          const width = span.getBoundingClientRect().width;
          span.remove();
          return width;
        });
        const even = Math.max(...advances) - Math.min(...advances) < 0.5;
        out[id][name] = even ? Math.ceil(Math.max(...advances)) : null;
      }
    }
    return out;
  },
  { families, weights: WEIGHTS },
);
await browser.close();

const tabularRows = families
  .map(({ id }) => `  '${id}': { regular: ${tabular[id]!.regular}, bold: ${tabular[id]!.bold} },`)
  .join('\n');
const rows = families
  .map(
    ({ id }) =>
      `  '${id}': {\n    regular: [${advances[id]!.regular!.join(', ')}],\n    bold: [${advances[id]!.bold!.join(', ')}],\n  },`,
  )
  .join('\n');
// Every family the catalogue knows, in lower case, to the table it is measured by: a served family its own, a named
// one its stand-in's, else the default family's stand-in's (formatting.md D202).
const fallback = DocumentFonts.drawnIn(DOCUMENT_DEFAULT_FONT)!;
const measuredAs = DOCUMENT_FONTS.map(
  (f) => `  '${f.name.toLowerCase()}': '${DocumentFonts.drawnIn(f.name) ?? fallback}',`,
).join('\n');
const source = `// Generated by apps/live/scripts/sheet-font-advances.ts (pnpm --filter live fonts:advances): do not edit by hand.
// Each editor font's advance (by id) and each served document family's (by name) for the characters U+0020 to U+007E,
// in thousandths of an em, regular (400) and bold (700), as Chromium draws the faces Google Fonts and Fontsource
// serve, rounded up.
export const ADVANCE_FIRST = 0x${FIRST.toString(16)};

export type FontAdvances = { readonly regular: readonly number[]; readonly bold: readonly number[] };

export const FONT_ADVANCES: Readonly<Record<string, FontAdvances>> = {
${rows}
};

// Each face's figure with tabular figures asked for, in thousandths of an em, regular and bold, rounded up;
// null where the face has none and its digits keep their own widths.
export type TabularDigits = { readonly regular: number | null; readonly bold: number | null };

export const TABULAR_DIGITS: Readonly<Record<string, TabularDigits>> = {
${tabularRows}
};

// Each document family the catalogue knows, in lower case, to the table above it is measured by.
export const FAMILY_MEASURED_AS: Readonly<Record<string, string>> = {
${measuredAs}
};

// The table a family the catalogue does not know is measured by: the default family's stand-in.
export const FAMILY_MEASURED_FALLBACK = '${fallback}';
`;
const target = fileURLToPath(
  new URL('../../../packages/sheets/src/text/font-advances.ts', import.meta.url),
);
writeFileSync(target, source);
console.log(`[fonts] wrote ${target} (${families.length} fonts, ${source.length} bytes)`);
