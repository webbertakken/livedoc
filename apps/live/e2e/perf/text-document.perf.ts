import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { TextDocument, writeTextDocumentFile } from '@livedoc/text-documents';
import { expect, test } from '../fixtures';
import { officeMenuItem } from '../office/office-menus';

// A 300-page text document against the budgets (docs/specs/034-text-documents/performance.md "Budgets", page-layout.md
// "Performance"): opening it laid out, a keystroke on a middle page painted within a frame, and the pages laid out again
// after a paste of 10 pages. Reports what it measured; fails only on a budget missed.

const BODY = '[role="textbox"][aria-label="Document body"]';
const SENTENCE =
  'Incremental layout keeps a long document quick to type in: only what a change touches is measured again. ';
// Two lines a paragraph, each followed by an empty one, as a person spaces paragraphs: 4,000 of each, about 870,000
// characters, under the document limit (1,020,000).
const PARAGRAPH = SENTENCE.repeat(2).trim();
const PAGES = 300;
const PARAGRAPHS = 8_000;
const KEYSTROKES = 60;

/** The budgets this probe holds the document to. */
export const TEXT_DOCUMENT_SCALE_BUDGETS = {
  pages: PAGES,
  /** Every keystroke's Event Timing duration, in milliseconds (one frame, with Event Timing's 8 ms rounding). */
  keystrokeMs: 16,
  /** The layout after a paste of 10 pages, in milliseconds. */
  pasteLayoutMs: 100,
} as const;

function longDocument(): string {
  const texts = Array.from({ length: PARAGRAPHS }, (_, i) =>
    i % 2 ? '' : `${i / 2 + 1}. ${PARAGRAPH}`,
  );
  const written = writeTextDocumentFile(TextDocument.fromTexts(texts, { title: 'Long' }), 'fodt');
  if (!written.ok) throw new Error(written.rejection);
  const path = join(mkdtempSync(join(tmpdir(), 'livedoc-long-')), 'Long.fodt');
  writeFileSync(path, written.bytes);
  return path;
}

// The `[text-document] layout` lines' times, as the trace logs them.
function layoutTimes(page: Page): number[] {
  const times: number[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (!text.startsWith('[text-document] layout')) return;
    const ms = /ms:\s*([\d.]+)/.exec(text)?.[1];
    if (ms) times.push(Number(ms));
  });
  return times;
}

test('a 300-page text document: opened, typed in and pasted into within the budgets', async ({
  page,
}) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.addInitScript(() => localStorage.setItem('livedoc:debug', 'text-document'));
  const layouts = layoutTimes(page);
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();

  const opened = performance.now();
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(longDocument());
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Long', { timeout: 120_000 });
  await expect
    .poll(async () => Number(await page.locator('[data-pages]').getAttribute('data-pages')), {
      timeout: 300_000,
    })
    .toBeGreaterThanOrEqual(PAGES);
  const openMs = Math.round(performance.now() - opened);
  const pages = Number(await page.locator('[data-pages]').getAttribute('data-pages'));

  // A keystroke on a middle page: the caret at the end of a paragraph there, then 60 characters 40 ms apart.
  const middle = page.locator(`${BODY} > p`).nth(Math.floor(PARAGRAPHS / 2));
  await middle.scrollIntoViewIfNeeded();
  await middle.click();
  await page.keyboard.press('End');
  await page.evaluate(() => {
    const w = window as unknown as { __keys: number[] };
    w.__keys = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (entry.name === 'keydown' || entry.name === 'keypress') w.__keys.push(entry.duration);
    }).observe({
      type: 'event',
      durationThreshold: 16,
      buffered: false,
    } as PerformanceObserverInit);
  });
  for (let i = 0; i < KEYSTROKES; i++) {
    await page.keyboard.type('x');
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(500);
  const keys = await page.evaluate(() => (window as unknown as { __keys: number[] }).__keys);
  const slowest = keys.length > 0 ? Math.max(...keys) : 0;

  // A paste of 10 pages after the middle paragraph.
  const tenPages = Array.from({ length: 150 }, (_, i) => `Pasted ${i + 1}. ${PARAGRAPH}`).join(
    '\n',
  );
  layouts.length = 0;
  await page.evaluate((text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    document
      .querySelector('[role="textbox"][aria-label="Document body"]')!
      .dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
  }, tenPages);
  await expect
    .poll(async () => Number(await page.locator('[data-pages]').getAttribute('data-pages')), {
      timeout: 120_000,
    })
    .toBeGreaterThanOrEqual(pages + 9);
  await page.waitForTimeout(1_000);
  const pasteLayoutMs = layouts.length > 0 ? Math.max(...layouts) : 0;

  const report = {
    pages,
    openMs,
    keystrokesOver16Ms: keys.length,
    slowestKeystrokeMs: slowest,
    pasteLayoutMs,
    pasteLayouts: layouts.length,
  };
  console.log(`[text-document perf] ${JSON.stringify(report)}`);
  test
    .info()
    .annotations.push({ type: 'text-document-scale', description: JSON.stringify(report) });
  expect(slowest).toBeLessThanOrEqual(TEXT_DOCUMENT_SCALE_BUDGETS.keystrokeMs);
  expect(pasteLayoutMs).toBeLessThanOrEqual(TEXT_DOCUMENT_SCALE_BUDGETS.pasteLayoutMs);
});
