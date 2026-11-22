import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// A table across pages (docs/specs/034-text-documents/tables.md "Laying out across pages"): a long table breaks between
// its rows, every row inside its page's text area, the page's edge drawn as a hidden row across the table; typing in
// a row lays it out again. Header rows repeat at the top of each page the table continues on. A row allowed to overflow
// breaks between its lines; one that may not moves to the next page whole.

const BODY = '[role="textbox"][aria-label="Document body"]';
const ROWS = 60;

test.use({ colorScheme: 'dark' });

const tableHtml = () =>
  `<p>Inventory</p><table>${Array.from(
    { length: ROWS },
    (_, r) => `<tr><td>Row ${r + 1}</td><td>Shelf ${(r % 7) + 1}</td><td>${r * 3}</td></tr>`,
  ).join('')}</table><p>After the table</p>`;

// Each of the table's own rows and its page edges, as drawn, and the page sheets.
async function drawn(page: Page) {
  return page.evaluate(() => {
    const sheets = [...document.querySelectorAll('[data-page-sheet]')].map((s) => {
      const r = s.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    const rows = [
      ...document
        .querySelector('table.text-document-table')!
        .querySelectorAll(':scope > tbody > tr'),
    ];
    const own = rows.filter((r) => !r.classList.contains('text-document-page-gap'));
    const gaps = rows.filter((r) => r.classList.contains('text-document-page-gap'));
    return {
      sheets,
      rows: own.map((r) => {
        const b = r.getBoundingClientRect();
        // Each line of its writing: a row breaking across pages has some on each.
        const range = document.createRange();
        const lines: { top: number; bottom: number }[] = [];
        const walker = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
        for (let text = walker.nextNode(); text; text = walker.nextNode()) {
          if (text.parentElement?.closest('.text-document-page-gap')) continue;
          range.selectNodeContents(text);
          for (const l of range.getClientRects())
            if (l.height > 0) lines.push({ top: l.top, bottom: l.bottom });
        }
        return { top: b.top, bottom: b.bottom, text: r.textContent ?? '', lines };
      }),
      gaps: gaps.map((g) => ({
        hidden: g.getAttribute('aria-hidden'),
        next: g.nextElementSibling?.textContent ?? '',
      })),
    };
  });
}

async function expectRowsInsideTextAreas(page: Page) {
  const { sheets, rows } = await drawn(page);
  // A page's height on screen, for the margins at this zoom (Letter: 11 in, margins 1 in).
  const inch = (sheets[0]!.bottom - sheets[0]!.top) / 11;
  const pagesHolding = new Set<number>();
  // Every line of every row inside a page's text area.
  for (const row of rows) {
    for (const line of row.lines) {
      const sheet = sheets.findIndex((s) => line.top >= s.top && line.top < s.bottom);
      expect(sheet, row.text).toBeGreaterThanOrEqual(0);
      pagesHolding.add(sheet);
      expect(line.top, row.text).toBeGreaterThanOrEqual(sheets[sheet]!.top + inch - 1.5);
      expect(line.bottom, row.text).toBeLessThanOrEqual(sheets[sheet]!.bottom - inch + 1.5);
    }
  }
  return pagesHolding.size;
}

test('a long table breaks between rows, each row inside a page', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await body.evaluate((target, markup) => {
    const data = new DataTransfer();
    data.setData('text/html', markup);
    data.setData('text/plain', 'table');
    target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, tableHtml());
  const table = body.locator('table.text-document-table').first();
  await expect(table.locator(':scope > tbody > tr:not(.text-document-page-gap)')).toHaveCount(ROWS);
  const gaps = table.locator('tr.text-document-page-gap');
  await expect(gaps.first()).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  const { gaps: edges, rows } = await drawn(page);
  for (const edge of edges) {
    expect(edge.hidden).toBe('true');
    // The next page starts with a whole row.
    expect(edge.next).toMatch(/^Row \d+Shelf \d\d+$/);
  }
  expect(await expectRowsInsideTextAreas(page)).toBeGreaterThan(1);
  await gaps.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('table-across-pages.png') });

  // Typing a longer value into the row before a page's edge lays the table out again: the row breaks between its
  // lines, every line still inside a page.
  const last = rows.findIndex((r) => r.text === edges[0]!.next) - 1;
  const before = table.locator(':scope > tbody > tr:not(.text-document-page-gap)').nth(last);
  await before.locator('td p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' and a note that wraps the cell onto a second line of its own');
  await expect(before.locator('td p').first()).toContainText('a second line');
  await page.waitForTimeout(300);
  expect(await expectRowsInsideTextAreas(page)).toBeGreaterThan(1);
  expectNoPageErrors(pageErrors);
});

const headedTableHtml = () =>
  `<table><tr><th>Item</th><th>Shelf</th><th>Count</th></tr>${Array.from(
    { length: ROWS },
    (_, r) => `<tr><td>Row ${r + 1}</td><td>Shelf ${(r % 7) + 1}</td><td>${r * 3}</td></tr>`,
  ).join('')}</table><p>After the table</p>`;

// Each page edge in the table, the copy of the header rows after it and the row after the copy.
async function repeated(page: Page) {
  return page.evaluate(() => {
    const sheets = [...document.querySelectorAll('[data-page-sheet]')].map((s) => {
      const r = s.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    const box = (e: Element | null | undefined) => {
      const r = e?.getBoundingClientRect();
      return { top: r?.top ?? 0, bottom: r?.bottom ?? 0, text: e?.textContent ?? '' };
    };
    return [...document.querySelectorAll('tr.text-document-page-gap-row')].map((edge) => {
      const copy = edge.nextElementSibling;
      const copyBox = box(copy);
      return {
        sheet: sheets.find((s) => copyBox.top >= s.top && copyBox.top < s.bottom) ?? null,
        copy: {
          ...copyBox,
          isCopy: copy?.classList.contains('text-document-page-gap-header') ?? false,
          hidden: copy?.getAttribute('aria-hidden') ?? null,
        },
        next: box(copy?.nextElementSibling),
      };
    });
  });
}

test('header rows repeat at the top of each page a table continues on', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await body.evaluate((target, markup) => {
    const data = new DataTransfer();
    data.setData('text/html', markup);
    data.setData('text/plain', 'table');
    target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, headedTableHtml());
  const table = body.locator('table.text-document-table').first();
  await expect(table.locator(':scope > tbody > tr:not(.text-document-page-gap)')).toHaveCount(
    ROWS + 1,
  );
  await expect(table.locator('tr.text-document-page-gap-header').first()).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  const edges = await repeated(page);
  expect(edges.length).toBeGreaterThan(0);
  for (const edge of edges) {
    // The copy stands at the page's text top (Letter, 1 in margins), hidden from reading; the next row under it.
    expect(edge.copy.isCopy).toBe(true);
    expect(edge.copy.hidden).toBe('true');
    expect(edge.copy.text).toBe('ItemShelfCount');
    expect(edge.sheet).not.toBeNull();
    const inch = (edge.sheet!.bottom - edge.sheet!.top) / 11;
    expect(edge.copy.top).toBeGreaterThanOrEqual(edge.sheet!.top + inch - 1.5);
    expect(edge.copy.top).toBeLessThanOrEqual(edge.sheet!.top + inch + 1.5);
    expect(edge.next.text).toMatch(/^Row \d+Shelf \d\d+$/);
    expect(edge.next.top).toBeGreaterThanOrEqual(edge.copy.bottom - 1);
  }
  expect(await expectRowsInsideTextAreas(page)).toBeGreaterThan(1);
  await table
    .locator('tr.text-document-page-gap-header')
    .first()
    .evaluate((copy) => copy.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('table-header-repeated.png') });

  // A change to the header row is drawn in every copy.
  await table.locator('th p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' name');
  await expect(table.locator('tr.text-document-page-gap-header').first()).toHaveText(
    'Item nameShelfCount',
  );
  // The reading order holds the header once: the copies are hidden from it.
  await expect(page.getByRole('columnheader', { name: 'Item name' })).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});

// A table of a header row, 30 short rows, then a row whose first cell holds 30 lines and whose second holds 10.
const tallRowHtml = () =>
  `<table><tr><th>Item</th><th>Note</th></tr>${Array.from({ length: 30 }, (_, r) => `<tr><td>Row ${r + 1}</td><td>x</td></tr>`).join('')}<tr><td>${Array.from(
    { length: 30 },
    (_, k) => `<p>Line ${k + 1}</p>`,
  ).join(
    '',
  )}</td><td>${Array.from({ length: 10 }, (_, k) => `<p>Note ${k + 1}</p>`).join('')}</td></tr></table><p>After</p>`;

// Each line of writing in the table's last row, and the page sheets, as drawn.
async function tallRowLines(page: Page) {
  return page.evaluate(() => {
    const sheets = [...document.querySelectorAll('[data-page-sheet]')].map((s) => {
      const r = s.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    const rows = [
      ...document
        .querySelector('table.text-document-table')!
        .querySelectorAll(':scope > tbody > tr'),
    ].filter((r) => !r.classList.contains('text-document-page-gap'));
    const last = rows[rows.length - 1]!;
    const lines = [...last.querySelectorAll('td > p')].map((p) => {
      const r = p.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, text: p.textContent ?? '' };
    });
    return { sheets, lines, edges: last.querySelectorAll('.text-document-page-gap-cell').length };
  });
}

test('a tall row breaks between its lines, and moves whole when it may not break', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await body.evaluate((target, markup) => {
    const data = new DataTransfer();
    data.setData('text/html', markup);
    data.setData('text/plain', 'table');
    target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, tallRowHtml());
  const table = body.locator('table.text-document-table').first();
  await expect(table.locator(':scope > tbody > tr:not(.text-document-page-gap)')).toHaveCount(32);
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(async () => (await tallRowLines(page)).edges).toBeGreaterThan(0);
  await page.waitForTimeout(300);

  // Every line of the row inside a page's text area (Letter, 1 in margins); the row on two pages.
  const inside = async () => {
    const { sheets, lines } = await tallRowLines(page);
    const inch = (sheets[0]!.bottom - sheets[0]!.top) / 11;
    const pages = new Set<number>();
    for (const line of lines) {
      const sheet = sheets.findIndex((s) => line.top >= s.top && line.top < s.bottom);
      expect(sheet, line.text).toBeGreaterThanOrEqual(0);
      pages.add(sheet);
      expect(line.top, line.text).toBeGreaterThanOrEqual(sheets[sheet]!.top + inch - 1.5);
      expect(line.bottom, line.text).toBeLessThanOrEqual(sheets[sheet]!.bottom - inch + 1.5);
    }
    return { pages, lines, sheets, inch };
  };
  const broken = await inside();
  expect(broken.pages.size).toBe(2);
  // The header row repeats inside the row's page edge, at the next page's text top, hidden from reading.
  const copy = await table
    .locator('.text-document-page-gap-cell .text-document-page-gap-header')
    .evaluate((t) => {
      const r = t.getBoundingClientRect();
      return {
        top: r.top,
        text: t.textContent,
        hidden: t.closest('[aria-hidden="true"]') !== null,
      };
    });
  expect(copy.text).toBe('ItemNote');
  expect(copy.hidden).toBe(true);
  const nextSheet = broken.sheets.find((s) => copy.top >= s.top && copy.top < s.bottom)!;
  expect(Math.abs(copy.top - (nextSheet.top + broken.inch))).toBeLessThan(2);
  await table
    .locator('.text-document-page-gap-cell')
    .first()
    .evaluate((gap) => gap.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('table-row-breaks.png') });

  // Allow row to overflow across pages, unchecked: the row starts the next page whole.
  await table.locator('td p', { hasText: /^Line 1$/ }).click();
  await (await officeMenuItem(page, ['Format', 'Table', 'Table properties'])).click();
  const panel = page.getByRole('complementary', { name: 'Table properties' });
  const overflow = panel.getByRole('checkbox', { name: 'Allow row to overflow across pages' });
  await expect(overflow).toBeChecked();
  // The box reads the writing after the paint: click, then wait for it.
  await overflow.click();
  await expect(overflow).not.toBeChecked();
  await expect.poll(async () => (await tallRowLines(page)).edges).toBe(0);
  await page.waitForTimeout(300);
  const whole = await inside();
  expect(whole.pages.size).toBe(1);
  const first = whole.lines[0]!;
  const sheet = whole.sheets.find((s) => first.top >= s.top && first.top < s.bottom)!;
  // At the page's text top, under the repeated header row.
  expect(first.top).toBeLessThan(sheet.top + whole.inch + 30);
  expectNoPageErrors(pageErrors);
});
