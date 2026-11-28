import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  agreement,
  blockKey,
  openedFixture,
  PAGE_START_FIXTURES,
  previewStartKeys,
} from '@livedoc/text-documents/testing/page-starts';
import { expect, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// The page previews' agreement measure (docs/specs/034-text-documents/agents-and-sync.md "Page previews"): each
// fixture opened in the editor, the block each page starts in read from its page gaps, against the block the previews
// start it in. A measurement, recorded into packages/text-documents/corpus/page-starts.json, which
// page-starts.test.ts then holds: run with RECORD_PAGE_STARTS=1 after a change to either layout.

const BODY = '[role="textbox"][aria-label="Document body"]';
const RECORD = join(
  import.meta.dirname,
  '../../../../packages/text-documents/corpus/page-starts.json',
);

test.skip(!process.env.RECORD_PAGE_STARTS, 'a measurement: RECORD_PAGE_STARTS=1 records it');

// Each page's first block's text, as drawn: page 1 the body's first block, then the block each page gap stands in
// (a paragraph split across the pages) or before.
async function editorStartTexts(page: import('@playwright/test').Page): Promise<string[]> {
  return page.locator(BODY).evaluate((body) => {
    const gapClass = 'text-document-page-gap';
    const blocks = [...body.children].filter((c) => !c.classList.contains(gapClass));
    const blockOf = (gap: Element): Element | undefined => {
      if (gap.parentElement === body) {
        let next = gap.nextElementSibling;
        while (next?.classList.contains(gapClass)) next = next.nextElementSibling;
        return next ?? undefined;
      }
      let at: Element | null = gap;
      while (at && at.parentElement !== body) at = at.parentElement;
      return at ?? undefined;
    };
    const textOf = (block: Element | undefined) => block?.textContent ?? '';
    return [
      textOf(blocks[0]),
      ...[...body.querySelectorAll(`.${gapClass}`)].map((gap) => textOf(blockOf(gap))),
    ];
  });
}

const recorded: Record<string, { editor: string[]; preview: string[] }> = {};

for (const [name, make] of Object.entries(PAGE_START_FIXTURES))
  test(`records where the editor starts each page of ${name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    const { document: opened, fodt } = await openedFixture(make);
    const file = join(mkdtempSync(join(tmpdir(), 'livedoc-page-starts-')), `${name}.fodt`);
    writeFileSync(file, fodt);
    await page.goto('/new?kind=text-document');
    await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
    const open = await officeMenuItem(page, ['File', 'Open']);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
    await chooser.setFiles(file);
    const frame = page.locator('[data-page-format="pages"]');
    await expect
      .poll(async () => Number(await frame.getAttribute('data-pages')))
      .toBeGreaterThan(1);
    await page.evaluate(() => document.fonts.ready);
    // Laid out again once the fonts have loaded: the count holds.
    let count = 0;
    await expect
      .poll(async () => {
        const now = Number(await frame.getAttribute('data-pages'));
        const settled = now === count;
        count = now;
        return settled;
      })
      .toBe(true);
    const texts = await editorStartTexts(page);
    // Named as the previews name a block: the first of the document's blocks, in order, whose words the drawn text holds.
    const keys = opened.body.map(blockKey);
    let from = 0;
    const editor = texts.map((text) => {
      const at = keys.findIndex(
        (key, n) => n >= from && text.includes(key.replace(/^table: /, '')),
      );
      from = Math.max(from, at);
      return at < 0 ? `unmatched: ${text.slice(0, 32)}` : keys[at]!;
    });
    recorded[name] = { editor, preview: previewStartKeys(opened) };
    expect(editor.length).toBe(count);
  });

test.afterAll(() => {
  if (Object.keys(recorded).length !== Object.keys(PAGE_START_FIXTURES).length) return;
  const total = Object.values(recorded).reduce(
    (sum, { editor, preview }) => {
      const each = agreement(editor, preview);
      return { pages: sum.pages + each.pages, same: sum.same + each.same };
    },
    { pages: 0, same: 0 },
  );
  writeFileSync(RECORD, `${JSON.stringify({ fixtures: recorded, agreement: total }, null, 2)}\n`);
  console.info(`[page-starts] ${total.same} of ${total.pages} pages start on the same block`);
});
