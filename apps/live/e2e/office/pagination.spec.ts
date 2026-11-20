import type { Locator, Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';

// Laying the writing onto pages (docs/specs/034-text-documents/page-layout.md "Laying out"): a long text document is
// laid onto pages, each page's writing inside its text area, breaking between lines, a heading never left at a
// page's foot; typing on lays the pages out again; Backspace at the head of a page deletes across its edge.

const BODY = '[role="textbox"][aria-label="Document body"]';
const WORDS =
  'The river runs past the mill and under the old stone bridge where the swallows nest each spring, ' +
  'and the miller listens to the wheel turn slowly through the long and quiet afternoon. ';

async function newDocument(page: Page) {
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
}

// Sections of a heading and paragraphs of one to four sentences, pasted as HTML.
function sections(count: number): string {
  return Array.from({ length: count }, (_, i) => {
    const paragraphs = Array.from(
      { length: 1 + (i % 3) },
      (_, k) => `<p>${WORDS.repeat(1 + ((i + k) % 4))}</p>`,
    );
    return `<h1>Section ${i + 1}</h1>${paragraphs.join('')}`;
  }).join('');
}

async function paste(body: Locator, html: string) {
  await body.evaluate((target, markup) => {
    const data = new DataTransfer();
    data.setData('text/html', markup);
    data.setData('text/plain', 'sections');
    target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, html);
}

// Each page start, as drawn: where the writing stopped above it, where it starts again, and the sheets around it.
async function pageStarts(page: Page) {
  return page.evaluate(() => {
    const sheets = [...document.querySelectorAll('[data-page-sheet]')].map((s) =>
      s.getBoundingClientRect(),
    );
    const gaps = [...document.querySelectorAll('.text-document-page-gap')].map((gap) => {
      const r = gap.getBoundingClientRect();
      const before = gap.parentElement?.matches('p')
        ? gap.parentElement
        : gap.previousElementSibling;
      return {
        top: r.top,
        bottom: r.bottom,
        inside: gap.parentElement?.matches('p') ?? false,
        heading: /Heading/.test(before?.getAttribute('data-style') ?? ''),
      };
    });
    return { sheets, gaps };
  });
}

test('lays a long document onto pages and lays it out again as it is edited', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await newDocument(page);
  const body = page.locator(BODY);
  const frame = page.locator('[data-page-format="pages"]');
  await body.click();
  await paste(body, sections(24));
  // Laid out once the fonts have loaded and the page count holds.
  await expect.poll(async () => Number(await frame.getAttribute('data-pages'))).toBeGreaterThan(4);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const count = Number(await frame.getAttribute('data-pages'));
  await expect(page.locator('[data-page-sheet]')).toHaveCount(count);

  const { sheets, gaps } = await pageStarts(page);
  expect(gaps).toHaveLength(count - 1);
  // A page's height on screen, for the margins at this zoom (Letter: 11 in, margins 1 in).
  const inch = sheets[0]!.height / 11;
  for (const [n, gap] of gaps.entries()) {
    const above = sheets[n]!;
    const below = sheets[n + 1]!;
    // The writing stops inside the text area of the page above, and starts at the next page's top margin.
    expect(gap.top).toBeLessThanOrEqual(above.bottom - inch + 1);
    expect(Math.abs(gap.bottom - (below.top + inch))).toBeLessThan(1.5);
    // A heading keeps with the next paragraph: never the last thing on a page.
    expect(gap.inside || !gap.heading).toBe(true);
  }
  // Some page breaks between two lines of a paragraph.
  expect(gaps.some((g) => g.inside)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('pages.png') });

  // Typing on at the end lays the pages out again, adding pages as the writing grows.
  await page.keyboard.press('ControlOrMeta+End');
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Enter');
    await page.keyboard.insertText(WORDS.repeat(3));
  }
  await expect
    .poll(async () => Number(await frame.getAttribute('data-pages')))
    .toBeGreaterThan(count);
  expectNoPageErrors(pageErrors);
});

test('Backspace at the head of a page deletes across its edge', async ({ page, pageErrors }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await newDocument(page);
  const body = page.locator(BODY);
  await body.click();
  // One long paragraph: it breaks between two of its lines.
  await paste(body, `<p>${WORDS.repeat(60)}</p>`);
  const gap = page.locator('.text-document-page-gap-inside').first();
  await expect(gap).toBeAttached();
  const paragraph = body.locator('p').first();
  const before = (await paragraph.textContent())!.length;
  await gap.scrollIntoViewIfNeeded();
  const box = (await gap.boundingBox())!;
  const text = (await paragraph.boundingBox())!;
  // The first line on the next page, at its start.
  await page.mouse.click(text.x + 40, box.y + box.height + 8);
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  await page.keyboard.press('Backspace');
  await expect.poll(async () => (await paragraph.textContent())!.length).toBe(before - 1);
  await expect(gap).toBeAttached();
  await page.screenshot({ path: test.info().outputPath('page-edge.png') });
  expectNoPageErrors(pageErrors);
});
