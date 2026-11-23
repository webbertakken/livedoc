// Reports how the fonts installed on this machine would draw text that was measured with no font (docs/specs/029-sheets/
// sheet.md "Row height", D99) where Inter cannot load: such cells are drawn in Inter, and fall back to the device's
// own font only when it does not arrive. For the page's own font stack and each system font found here, it wraps the corpus below as the engine
// does, draws every line as the grid does, and counts the lines drawn past their room, and past their cell (cut off).
// A report, never a test: it depends on the machine. Run: pnpm --filter live fonts:system
import { chromium } from '@playwright/test';
import { wrapLines } from '../../../packages/sheets/src/text/wrap-lines.ts';

// The stack a cell with no font draws in: Tailwind's preflight on <html>, which nothing in the app overrides.
const DEVICE = 'ui-sans-serif, system-ui, sans-serif';
// Fonts a device's system may name, reported where they are installed.
const FAMILIES = [
  DEVICE,
  'Segoe UI',
  'SF Pro Text',
  'Helvetica Neue',
  'Roboto',
  'Ubuntu',
  'Noto Sans',
  'Cantarell',
  'Adwaita Sans',
  'Liberation Sans',
  'Arial',
  'DejaVu Sans',
];
const WEIGHTS = [400, 700];
// A cell's text with no size of its own, then 12 and 16 points (fontPx).
const SIZES = [13, 16, 21];
// Text rooms from a narrow column to a wide one, in px.
const ROOMS = [52, 72, 92, 112, 132, 152, 192, 232, 292, 392];
// What a cell keeps clear at its text's right (packages/sheets/src/row-fit.ts CELL_PAD_PX): a line reaching further
// is cut off.
const CELL_PAD_PX = 4;

// What people put in a wrapping cell: prose, notes, headings, labels in capitals, numbers in a sentence, a link.
const CORPUS = [
  'The quarterly review moved to Thursday because two of the regional leads are travelling until Wednesday night.',
  'Follow up with the supplier about the delayed shipment and confirm the new delivery window before Friday.',
  'Waiting on legal: the contract needs a second signature and the revised indemnity clause, see the thread.',
  'Customer reported that the export fails when the sheet holds more than 200 columns, but only in Firefox.',
  'Minimum order quantity 250 units at 14.95 each, 10% off above 1,000 units, 30 days net, free shipping.',
  'Ship the new onboarding flow, then measure activation for two weeks and compare it with the old baseline.',
  'Marketing wants a wider hero image, a shorter headline and a clearer call to action above the fold.',
  'TOTAL REVENUE BY REGION AND QUARTER, EXCLUDING REFUNDS AND WRITE-OFFS',
  'WWW MMM WORKSHOP SUMMARY: OWNERS, DUE DATES AND BLOCKERS FOR EVERY TEAM',
  'Annual Budget Review and Planning Session With the Management Team',
  'Project Kick-Off Meeting Notes, Open Questions and Next Steps',
  'https://example.com/reports/2026/quarterly-review/final-version-approved.pdf',
  'first.lastname@example-company.co.uk, second.person@another-organisation.org',
  'Invoice 2026-000417 for 12,480.00 EUR, due 30/11/2026, paid 0.00, open 12,480.00',
  'mmmm wwww mmmm wwww minimum warm summer swimming common mammal window',
  'illicit little lilt, fill it till it fits: fifty-five filing bills',
  'De vergadering is verplaatst naar donderdag omdat twee collega’s tot woensdagavond onderweg zijn.',
  'Review: needs work. Risk: high. Owner: Sam. Due: 12 Dec. Status: blocked by procurement (again).',
];

// Every line the engine breaks the corpus into, with the room it was broken for.
type Line = { text: string; px: number; room: number; bold: boolean };
const lines: Line[] = [];
for (const px of SIZES)
  for (const room of ROOMS)
    for (const bold of [false, true])
      for (const text of CORPUS)
        for (const line of wrapLines(text, room, px, { bold }))
          lines.push({ text: line.trimEnd(), px, room, bold });

const browser = await chromium.launch({ args: ['--mute-audio'] });
const page = await browser.newPage();
// Drawn as the grid draws a cell's lines (SheetCells.tsx): on their own line, placed by the font's own widths.
await page.setContent(
  '<!doctype html><span id="probe" style="position:absolute;white-space:pre;text-rendering:geometricPrecision"></span>',
);
const report = await page.evaluate(
  ({ families, weights, lines, device, pad }) => {
    const probe = document.getElementById('probe')!;
    const widthOf = (text: string) => {
      probe.textContent = text;
      return probe.getBoundingClientRect().width;
    };
    const SAMPLE = 'mmmmmmmmmmlliWW00';
    const generic = (family: string) => {
      probe.style.font = `400 100px ${family}`;
      return widthOf(SAMPLE);
    };
    const mono = generic('monospace');
    const serif = generic('serif');
    const out: {
      family: string;
      weight: number;
      past: number;
      cut: number;
      of: number;
      worst: string;
    }[] = [];
    for (const family of families) {
      const named = family === device ? family : `"${family}"`;
      // Installed when it draws unlike both generic fallbacks.
      if (
        family !== device &&
        generic(`${named}, monospace`) === mono &&
        generic(`${named}, serif`) === serif
      )
        continue;
      for (const weight of weights) {
        const mine = lines.filter((line) => line.bold === (weight === 700));
        let past = 0;
        let cut = 0;
        let furthest = 0;
        let worst = 'none';
        for (const line of mine) {
          probe.style.font = `${weight} ${line.px}px ${named}`;
          const over = widthOf(line.text) - line.room;
          if (over <= 0) continue;
          past++;
          if (over > pad) cut++;
          if (over > furthest) {
            furthest = over;
            worst = `${over.toFixed(1)} px past ${line.room} px at ${line.px} px: "${line.text}"`;
          }
        }
        out.push({ family, weight, past, cut, of: mine.length, worst });
      }
    }
    return out;
  },
  { families: FAMILIES, weights: WEIGHTS, lines, device: DEVICE, pad: CELL_PAD_PX },
);
await browser.close();

console.log('font | weight | lines past their room | of those cut off | lines | furthest');
for (const row of report)
  console.log(
    `${row.family} | ${row.weight} | ${row.past} | ${row.cut} | ${row.of} | ${row.worst}`,
  );
