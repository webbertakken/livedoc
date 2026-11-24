import { readFileSync } from 'node:fs';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, guestSigFor, mintSignedGuest, ownerHeaders, test } from './fixtures';

// Rows that fit their text (docs/specs/029-sheets/sheet.md "Row height"): an automatic row is as tall as the text in
// its cells needs, a row sized by hand keeps its size, and Fit to Data hands it back. Proven in the real grid: what
// is measured without a browser has to hold in one.

test.use({ colorScheme: 'dark', launchOptions: { args: ['--mute-audio'] } });

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
const CANVAS = '[data-canvas-a11y-root]';
// The height of a row nobody sized, holding one line (packages/sheets/src/limits.ts ROW_HEIGHT_NEW).
const ROW_HEIGHT_PX = 28;
// The height the test drags a row to.
const SIZED_PX = 40;
const NOTES_WIDTH_PX = 220;

const REVIEW =
  'The quarterly review moved to Thursday because two of the regional leads are travelling until Wednesday night.';
const SUPPLIER =
  'Follow up with the supplier about the delayed shipment and confirm the new delivery window before Friday.';
const CONTRACT =
  'Waiting on legal: the contract needs a second signature and the revised indemnity clause, see the thread.';
// No place to break: its lines are cut at the last character that fits, so each is as wide as its room allows.
const LINK =
  'https://example.com/reports/2026/quarterly-review/final-version-approved-by-the-board.pdf';

const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(4, '0')}`);
const ROWS = ids('r', 12);
const COLS = ids('c', 4);

type SeedCell = { r: string; c: string; i?: { s: string }; f?: Record<string, unknown> };
const cell = (r: number, c: number, s: string, f?: Record<string, unknown>): SeedCell => ({
  r: ROWS[r]!,
  c: COLS[c]!,
  i: { s },
  ...(f ? { f } : {}),
});
const WRAPS = { wr: 'w' };

// A document with one Sheet tab, its Notes column 220 px wide, opened as its owner. Answers the grid and a reader of
// the row sizes the store holds.
async function openSheet(
  page: Page,
  request: APIRequestContext,
  baseURL: string,
  seed: { cells: SeedCell[]; font?: string },
) {
  const owner = await mintSignedGuest(request);
  const id = crypto.randomUUID();
  const tabId = crypto.randomUUID();
  const sheetId = 'e2erowfit1';
  const headers = ownerHeaders(owner, { Origin: new URL(baseURL).origin });
  const now = Date.now();
  const seeded = await request.post(`${apiBase}/documents`, {
    headers,
    data: {
      id,
      name: 'Review notes',
      tabs: [
        {
          id: tabId,
          name: 'Notes',
          kind: 'sheet',
          opensIn: 'plan',
          ...(seed.font ? { font: seed.font } : {}),
          elements: [
            {
              id: 'sheet',
              type: 'shape',
              shape: 'plan-sheet',
              // Clear of the toolbar along the top.
              x: 120,
              y: 260,
              width: 960,
              height: 560,
              planSheet: { sheetId },
            },
          ],
        },
      ],
      sheets: [
        {
          id: sheetId,
          tabId,
          title: 'Notes',
          layout: { rows: ROWS, cols: COLS, colSize: { [COLS[1]!]: NOTES_WIDTH_PX } },
          cells: seed.cells,
          rev: 0,
          createdAt: now,
          updatedAt: now,
          updatedBy: { id: owner, name: 'Owner', color: '#0ea5e9' },
        },
      ],
    },
  });
  expect(seeded.ok()).toBe(true);

  await page.addInitScript(
    ({ o, sig }) => {
      localStorage.setItem('livedoc:v2:self-id', o);
      if (sig) localStorage.setItem('livedoc:v2:self-sig', sig);
      localStorage.setItem('livedoc:v2:name-confirmed', '1');
    },
    { o: owner, sig: guestSigFor(owner) },
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/document/${id}`);
  await page.locator(CANVAS).waitFor();
  const grid = page.getByRole('grid', { name: 'Notes grid' });
  await expect(grid).toBeVisible();

  const rowSizes = async () => {
    const res = await request.get(`${apiBase}/documents/${id}/sheets`, { headers });
    const body = (await res.json()) as {
      sheets: { id: string; layout: { rowSize?: Record<string, number> } }[];
    };
    return body.sheets.find((s) => s.id === sheetId)?.layout.rowSize ?? {};
  };
  return { grid, rowSizes };
}

const rowHeader = (page: Page, row: number) =>
  page.locator(`[role="rowheader"][aria-rowindex="${row}"]`);
const rowHeight = async (page: Page, row: number) =>
  Math.round((await rowHeader(page, row).boundingBox())!.height);

// The middle of a cell, from its row's and its column's header.
async function cellPoint(page: Page, row: number, col: number): Promise<{ x: number; y: number }> {
  const r = (await rowHeader(page, row).boundingBox())!;
  const c = (await page.locator(`[role="columnheader"][aria-colindex="${col}"]`).boundingBox())!;
  return { x: c.x + c.width / 2, y: r.y + r.height / 2 };
}

// The drawn cell texts taller than their cell: the lines a row cuts off.
function textsCutOff(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-sheet-text]')]
      .filter((node) => node.scrollHeight > node.clientHeight)
      .map((node) => node.textContent ?? ''),
  );
}

// For every cell of several lines: how far its widest drawn line reaches past the room its lines were broken for
// (negative while it fits), and how many lines it has.
function linesAgainstTheirRoom(page: Page): Promise<{ past: number; lines: number }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-sheet-text]')]
      .filter((node) => (node.textContent ?? '').includes('\n'))
      .map((node) => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const room = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const range = document.createRange();
        range.selectNodeContents(node);
        const widths = [...range.getClientRects()].map((line) => line.width);
        return { past: Math.max(...widths) - room, lines: widths.length };
      }),
  );
}

test('rows fit their text, a sized row keeps its height, and Fit to Data hands it back', async ({
  page,
  baseURL,
}) => {
  // A tab with no font, as most are: its cells are measured and drawn in Inter (sheet.md "Row height", D99).
  const { grid, rowSizes } = await openSheet(page, page.request, baseURL!, {
    cells: [
      cell(0, 0, 'Topic', { b: true }),
      cell(0, 1, 'Notes', { b: true }),
      cell(0, 2, 'Owner', { b: true }),
      cell(1, 0, 'Quarterly review'),
      cell(1, 1, REVIEW, WRAPS),
      cell(1, 2, 'Sam'),
      cell(2, 0, 'Supplier'),
      // Set to wrap, with nothing in it yet.
      { r: ROWS[2]!, c: COLS[1]!, f: WRAPS },
      cell(2, 2, 'Ada'),
      cell(3, 0, 'Contract'),
      cell(3, 1, CONTRACT, { ...WRAPS, b: true }),
      cell(3, 2, 'Lee'),
    ],
  });

  expect(
    await page
      .locator('[data-sheet-cells]')
      .first()
      .evaluate((node) => getComputedStyle(node).fontFamily),
  ).toMatch(/^"?Inter\b/);

  // A sheet nobody sized fits at once: the rows that wrap are taller, the rest keep the sheet's row height.
  await expect.poll(() => rowHeight(page, 2)).toBeGreaterThan(ROW_HEIGHT_PX * 2);
  const fitted = await rowHeight(page, 2);
  expect(await rowHeight(page, 1)).toBe(ROW_HEIGHT_PX);
  expect(await rowHeight(page, 3)).toBe(ROW_HEIGHT_PX);
  expect(await rowHeight(page, 4)).toBeGreaterThan(ROW_HEIGHT_PX * 2);

  // A cell that wraps grows its row as it is typed into.
  const empty = await cellPoint(page, 3, 2);
  await page.mouse.click(empty.x, empty.y);
  await page.keyboard.type(SUPPLIER);
  await page.keyboard.press('Enter');
  await expect.poll(() => rowHeight(page, 3)).toBeGreaterThan(ROW_HEIGHT_PX * 2);
  // Automatic rows cut no line off, and their heights are worked out, never stored.
  expect(await textsCutOff(page)).toEqual([]);
  expect(await rowSizes()).toEqual({});

  // Dragging a row header's edge sizes the row: it keeps that height, and its text is cut off there.
  const header = (await rowHeader(page, 2).boundingBox())!;
  const edge = { x: header.x + header.width / 2, y: header.y + header.height - 1 };
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x, edge.y - (fitted - SIZED_PX), { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => rowHeight(page, 2)).toBe(SIZED_PX);
  await expect.poll(rowSizes).toEqual({ [ROWS[1]!]: SIZED_PX });
  expect(await textsCutOff(page)).toEqual([expect.stringContaining('The quarterly')]);

  // Whatever its cells then hold, a sized row stays as set.
  const sized = await cellPoint(page, 2, 2);
  await page.mouse.click(sized.x, sized.y);
  await page.keyboard.type(`${REVIEW} ${SUPPLIER}`);
  await page.keyboard.press('Enter');
  await expect(grid.locator('[data-sheet-cells]')).toContainText('Wednesday night. Follow');
  expect(await rowHeight(page, 2)).toBe(SIZED_PX);

  // Fit to Data, in the row header's menu, hands the row back: it fits its text again and its size is gone.
  const sizedHeader = (await rowHeader(page, 2).boundingBox())!;
  await page.mouse.click(
    sizedHeader.x + sizedHeader.width / 2,
    sizedHeader.y + sizedHeader.height / 2,
    { button: 'right' },
  );
  await page
    .getByRole('dialog', { name: 'Row menu' })
    .getByRole('button', { name: 'Fit to Data' })
    .click();
  await expect.poll(() => rowHeight(page, 2)).toBeGreaterThan(fitted);
  await expect.poll(rowSizes).toEqual({});
  expect(await textsCutOff(page)).toEqual([]);
});

// A line is broken from a table of its font's widths, so it has to be drawn at those widths: Chromium on Linux snaps
// each character to whole px unless told otherwise, and then draws a full line wider than its room. Roboto Mono is
// served here from the package the editor bundles, so the test needs no outside world; every character of it is 0.6
// of its size wide, in the table as in the file.
test('a line is drawn no wider than the room it was broken for', async ({ page, baseURL }) => {
  const face = (weight: number) =>
    `@font-face { font-family: 'Roboto Mono'; font-weight: ${weight}; src: url(data:font/woff2;base64,${readFileSync(
      new URL(
        `../node_modules/@fontsource/roboto-mono/files/roboto-mono-latin-${weight}-normal.woff2`,
        import.meta.url,
      ),
    ).toString('base64')}) format('woff2'); }`;
  await page.route('https://fonts.googleapis.com/css2**', (route) =>
    route.fulfill({ contentType: 'text/css', body: `${face(400)}\n${face(700)}` }),
  );
  await openSheet(page, page.request, baseURL!, {
    font: 'roboto-mono',
    cells: [
      cell(0, 1, REVIEW, WRAPS),
      cell(1, 1, LINK, WRAPS),
      cell(2, 1, CONTRACT, { ...WRAPS, b: true }),
    ],
  });
  // Both weights drawn from the file served above, never a fallback.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const faces = await Promise.all(
          [400, 700].map((weight) => document.fonts.load(`${weight} 13px 'Roboto Mono'`)),
        );
        return faces.map((loaded) => loaded.length);
      }),
    )
    .toEqual([1, 1]);

  const cells = await linesAgainstTheirRoom(page);
  expect(cells).toHaveLength(3);
  for (const { past, lines } of cells) {
    expect(lines).toBeGreaterThan(2);
    // Fits, and by less than a character: the link's lines are cut at the last character that fits.
    expect(past).toBeLessThanOrEqual(0.5);
  }
  expect(Math.max(...cells.map((c) => c.past))).toBeGreaterThan(-8);
  expect(await textsCutOff(page)).toEqual([]);
});
