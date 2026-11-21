import type { Page } from '@playwright/test';
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

const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(4, '0')}`);

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

// Every drawn cell text that is cut off: taller than its cell, or with a line reaching past its cell's sides.
function cutOffTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const cut: string[] = [];
    for (const node of document.querySelectorAll<HTMLElement>('[data-sheet-text]')) {
      const text = node.textContent ?? '';
      if (node.scrollHeight > node.clientHeight) cut.push(`too tall: ${text}`);
      // A cell of several lines draws the lines its row was sized by; each has to end inside the cell.
      if (!text.includes('\n')) continue;
      const box = node.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const line of range.getClientRects())
        if (line.right > box.right + 0.5 || line.left < box.left - 0.5)
          cut.push(`${(line.right - box.right).toFixed(1)} px past its cell: ${text}`);
    }
    return cut;
  });
}

test('rows fit their text, a sized row keeps its height, and Fit to Data hands it back', async ({
  page,
  baseURL,
}) => {
  const owner = await mintSignedGuest(page.request);
  const id = crypto.randomUUID();
  const tabId = crypto.randomUUID();
  const sheetId = 'e2erowfit1';
  const headers = ownerHeaders(owner, { Origin: new URL(baseURL!).origin });
  const now = Date.now();
  const rows = ids('r', 12);
  const cols = ids('c', 4);
  const cell = (r: number, c: number, s: string, f?: object) => ({
    r: rows[r]!,
    c: cols[c]!,
    i: { s },
    ...(f ? { f } : {}),
  });
  const wraps = { wr: 'w' };
  const seeded = await page.request.post(`${apiBase}/documents`, {
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
          layout: { rows, cols, colSize: { [cols[1]!]: NOTES_WIDTH_PX } },
          cells: [
            cell(0, 0, 'Topic', { b: true }),
            cell(0, 1, 'Notes', { b: true }),
            cell(0, 2, 'Owner', { b: true }),
            cell(1, 0, 'Quarterly review'),
            cell(1, 1, REVIEW, wraps),
            cell(1, 2, 'Sam'),
            cell(2, 0, 'Supplier'),
            // Set to wrap, with nothing in it yet.
            { r: rows[2]!, c: cols[1]!, f: wraps },
            cell(2, 2, 'Ada'),
            cell(3, 0, 'Contract'),
            cell(3, 1, CONTRACT, { ...wraps, b: true }),
            cell(3, 2, 'Lee'),
          ],
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
    const res = await page.request.get(`${apiBase}/documents/${id}/sheets`, { headers });
    const body = (await res.json()) as {
      sheets: { id: string; layout: { rowSize?: Record<string, number> } }[];
    };
    return body.sheets.find((s) => s.id === sheetId)?.layout.rowSize ?? {};
  };

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
  // Automatic rows cut nothing off, and their heights are worked out, never stored.
  expect(await cutOffTexts(page)).toEqual([]);
  expect(await rowSizes()).toEqual({});

  // Dragging a row header's edge sizes the row: it keeps that height, and its text is cut off there.
  const header = (await rowHeader(page, 2).boundingBox())!;
  const edge = { x: header.x + header.width / 2, y: header.y + header.height - 1 };
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x, edge.y - (fitted - SIZED_PX), { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => rowHeight(page, 2)).toBe(SIZED_PX);
  await expect.poll(rowSizes).toEqual({ [rows[1]!]: SIZED_PX });
  expect(await cutOffTexts(page)).toEqual([expect.stringContaining('too tall: The quarterly')]);

  // Whatever its cells then hold, a sized row stays as set.
  const sized = await cellPoint(page, 2, 2);
  await page.mouse.click(sized.x, sized.y);
  await page.keyboard.type(`${REVIEW} ${SUPPLIER}`);
  await page.keyboard.press('Enter');
  await expect(grid).toContainText('Wednesday night. Follow');
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
  expect(await cutOffTexts(page)).toEqual([]);
});
