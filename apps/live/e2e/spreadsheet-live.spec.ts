import { randomUUID } from 'node:crypto';
import type { Browser, Page } from '@playwright/test';
import { emptyLayout, WorkbookRecord } from '@livedoc/sheets';
import { seedOfflineDocuments } from './offline-seed';
import {
  expect,
  expectNoPageErrors,
  guestSigFor,
  mintSignedGuest,
  pageOwnerHeaders,
  test,
} from './fixtures';

// A spreadsheet live and offline (plan 0020 Phase 5 box 8; docs/specs/029-sheets/sheet-store.md "Changing the
// workbook", "Live for everyone", "Offline documents"): a sheet added through the api reaches every open editor, a
// formula on one sheet reads another and follows it live in a second browser, the sheet bar shows who is on which
// sheet, and a This Browser spreadsheet keeps its edits across a reload.

test.use({ colorScheme: 'dark', launchOptions: { args: ['--mute-audio'] } });

const READY = '[data-spreadsheet-surface="ready"]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

async function peerOn(browser: Browser, baseURL: string, code: string): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL,
    colorScheme: 'dark',
    viewport: { width: 1280, height: 860 },
  });
  const page = await ctx.newPage();
  await page.goto(`/document/shared?s=${code}`);
  const join = page.getByRole('button', { name: /^join$/i });
  await expect(join.or(page.locator(READY))).toBeVisible();
  if (await join.isVisible()) await join.click();
  await expect(page.locator(READY)).toBeVisible();
  return page;
}

// Types into a cell as a person does: its name in the Name box, then the input, then Enter.
async function typeInto(page: Page, cell: string, input: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(cell);
  await nameBox.press('Enter');
  await page.keyboard.type(input);
  await page.keyboard.press('Enter');
}

async function inputOf(page: Page, cell: string): Promise<string> {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(cell);
  await nameBox.press('Enter');
  return page.getByRole('textbox', { name: 'Formula bar' }).first().inputValue();
}

test('sheets read one another live, and the sheet bar shows who is on which sheet', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  const id = new URL(page.url()).pathname.split('/')[2]!;
  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });

  // A sheet added through the api reaches the open editor's sheet bar.
  const added = await page.request.post(`${apiBase}/documents/${id}/workbook/sheets`, {
    headers,
    data: { name: 'Data' },
  });
  expect(added.status()).toBe(201);
  await expect(page.getByRole('tab', { name: /^Data/ })).toBeVisible();

  const share = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'edit' },
  });
  const code = ((await share.json()) as { link: { code: string } }).link.code;
  const peer = await peerOn(browser, baseURL!, code);

  // The peer fills Data while the owner, on Sheet1, writes the formula that reads it.
  await peer.getByRole('tab', { name: /^Data/ }).click();
  await expect(peer.getByRole('grid', { name: 'Data grid' })).toBeVisible();
  await typeInto(peer, 'A1', '21');
  await typeInto(page, 'A1', '=Data!A1*2');
  const sheet1 = page.getByRole('grid', { name: 'Sheet1 grid' });
  await expect(sheet1).toContainText('42');

  // The owner sees the peer on Data, in the sheet bar.
  const dataTab = page.getByRole('tab', { name: /^Data, also here: / });
  await expect(dataTab).toBeVisible();
  await page
    .getByRole('tablist', { name: 'Sheets' })
    .screenshot({ path: testInfo.outputPath('sheet-bar-presence.png') });

  // The peer changes Data: the owner's formula follows, live.
  await typeInto(peer, 'A1', '50');
  await expect(sheet1).toContainText('100');
  expect(await inputOf(page, 'A1')).toBe('=Data!A1*2');
  expectNoPageErrors(pageErrors);
});

test('a This Browser spreadsheet keeps its edits across a reload', async ({ page, pageErrors }) => {
  const owner = await mintSignedGuest(page.request);
  await page.addInitScript(
    ({ id, sig }) => {
      localStorage.setItem('livedoc:v2:self-id', id);
      if (sig) localStorage.setItem('livedoc:v2:self-sig', sig);
      localStorage.setItem('livedoc:v2:name-confirmed', '1');
    },
    { id: owner, sig: guestSigFor(owner) },
  );
  await page.goto('/explorer/home');
  let n = 11;
  const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
  const id = randomUUID();
  const now = Date.now();
  await seedOfflineDocuments(page, [
    {
      id,
      name: 'Kept here',
      folderId: null,
      createdAt: now,
      savedAt: now,
      tabs: [{ id: 'sheet-tab-1', name: 'Sheet1', kind: 'sheet', elements: [] }],
      sheets: [
        {
          id: 'sheetKept1',
          tabId: 'sheet-tab-1',
          title: 'Sheet1',
          layout: emptyLayout(rand, 50, 6),
          cells: [],
          rev: 0,
          createdAt: now,
          updatedAt: now,
          updatedBy: { id: '', name: 'Someone', color: '#94a3b8' },
        },
      ],
      workbook: WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' }),
    },
  ]);
  await page.goto(`/document/${id}`);
  await expect(page.locator(READY)).toBeVisible();
  await typeInto(page, 'A1', 'kept');
  await typeInto(page, 'B1', '=LEN(A1)');
  await expect(
    page.getByRole('grid', { name: 'Sheet1 grid' }).locator('[data-sheet-cells]'),
  ).toContainText('4');

  // Stored in this browser before the reload: the record holds both cells.
  await expect
    .poll(() =>
      page.evaluate(
        (docId) =>
          new Promise<number>((resolve, reject) => {
            const open = indexedDB.open('livedoc-offline');
            open.onerror = () => reject(open.error ?? new Error('open failed'));
            open.onsuccess = () => {
              const get = open.result.transaction('documents').objectStore('documents').get(docId);
              get.onsuccess = () => {
                const rec = get.result as { sheets?: { cells: unknown[] }[] } | undefined;
                open.result.close();
                resolve(rec?.sheets?.[0]?.cells.length ?? 0);
              };
            };
          }),
        id,
      ),
    )
    .toBe(2);

  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await expect(
    page.getByRole('grid', { name: 'Sheet1 grid' }).locator('[data-sheet-cells]'),
  ).toContainText('4');
  expect(await inputOf(page, 'A1')).toBe('kept');
  expect(await inputOf(page, 'B1')).toBe('=LEN(A1)');
  expectNoPageErrors(pageErrors);
});

// formulas.md "Recalculation", performance.md "Rules": the engine works in a Web Worker, so a long chain worked out
// again never holds up the page. 10,000 links, each also summing 400 cells (4 million reads), changed at its head.
test('a long chain worked out again never holds up typing', async ({ page, pageErrors }) => {
  const owner = await mintSignedGuest(page.request);
  await page.addInitScript(
    ({ id, sig }) => {
      localStorage.setItem('livedoc:v2:self-id', id);
      if (sig) localStorage.setItem('livedoc:v2:self-sig', sig);
      localStorage.setItem('livedoc:v2:name-confirmed', '1');
    },
    { id: owner, sig: guestSigFor(owner) },
  );
  await page.goto('/explorer/home');
  let n = 17;
  const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
  const LINKS = 10_000;
  const SUMMED = 400;
  const layout = emptyLayout(rand, LINKS, 6);
  const [colA, colB] = [layout.cols[0]!, layout.cols[1]!];
  const cells: { r: string; c: string; i: object }[] = [
    { r: layout.rows[0]!, c: colA, i: { n: 1 } },
  ];
  for (let r = 0; r < SUMMED; r++) cells.push({ r: layout.rows[r]!, c: colB, i: { n: 1 } });
  for (let r = 1; r < LINKS; r++)
    cells.push({
      r: layout.rows[r]!,
      c: colA,
      i: {
        f: {
          t: '=@0+SUM(@1)',
          r: [
            { r1: layout.rows[r - 1]!, c1: colA },
            { r1: layout.rows[0]!, c1: colB, r2: layout.rows[SUMMED - 1]!, c2: colB, a: 15 },
          ],
        },
      },
    });
  const id = randomUUID();
  const now = Date.now();
  await seedOfflineDocuments(page, [
    {
      id,
      name: 'Long chain',
      folderId: null,
      createdAt: now,
      savedAt: now,
      tabs: [{ id: 'sheet-tab-1', name: 'Sheet1', kind: 'sheet', elements: [] }],
      sheets: [
        {
          id: 'sheetChain1',
          tabId: 'sheet-tab-1',
          title: 'Sheet1',
          layout,
          cells: cells as never,
          rev: 0,
          createdAt: now,
          updatedAt: now,
          updatedBy: { id: '', name: 'Someone', color: '#94a3b8' },
        },
      ],
      workbook: WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' }),
    },
  ]);
  await page.goto(`/document/${id}`);
  await expect(page.locator(READY)).toBeVisible();
  const grid = page.getByRole('grid', { name: 'Sheet1 grid' });
  // Its first workout in: the third link is 1 + 2 × 400.
  await expect(grid.locator('[data-sheet-cells]')).toContainText('801');

  // Every task the page's main thread runs past 50 ms, from the change on.
  await page.evaluate(() => {
    const w = window as unknown as { longTasks: number[] };
    w.longTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.longTasks.push(e.duration);
    }).observe({ type: 'longtask' });
  });
  await typeInto(page, 'A1', '2');
  // Typed while the Worker works the chain out again: it shows straight away.
  await typeInto(page, 'D1', 'typed');
  await expect(grid.locator('[data-sheet-cells]')).toContainText('typed');
  await expect(grid.locator('[data-sheet-cells]')).toContainText('802');
  // The chain's last link, once the Worker is done.
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(`A${LINKS}`);
  await nameBox.press('Enter');
  await expect(grid.locator('[data-sheet-cells]')).toContainText(String(2 + (LINKS - 1) * SUMMED), {
    timeout: 30_000,
  });
  const longest = await page.evaluate(() =>
    Math.max(0, ...(window as unknown as { longTasks: number[] }).longTasks),
  );
  console.info(
    `[sheets perf] longest main-thread task while recalculating ${longest.toFixed(0)} ms`,
  );
  // performance.md "Budgets": no keystroke past 100 ms; a runner's headroom on top.
  expect(longest).toBeLessThan(250);
  expectNoPageErrors(pageErrors);
});
