import { writeFileSync } from 'node:fs';
import { TextDocument, writeTextDocumentFile, type Paragraph } from '@livedoc/text-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Tab stops on a text document (docs/specs/034-text-documents/text-and-paragraphs.md "Writing", "Tab stops"): Tab types
// a tab that reaches the next default stop, every half inch; a Word file's left, right and centre stops, with a dot
// leader, draw the text after each tab where the stop says.

const BODY = '[role="textbox"][aria-label="Document body"]';
// CSS pixels per point.
const PX = 4 / 3;

function wordFile(path: string) {
  const blank = TextDocument.fromTexts(['Left\tat two inches', 'Name\tPage 7', 'Centred\tmiddle'], {
    format: 'ooxml',
  });
  const [a, b, c] = blank.body as Paragraph[];
  const body = [
    { ...a!, props: { tabStops: [{ position: 144, align: 'start' as const }] } },
    {
      ...b!,
      props: { tabStops: [{ position: 288, align: 'end' as const, leader: 'dot' as const }] },
    },
    { ...c!, props: { tabStops: [{ position: 216, align: 'center' as const }] } },
  ];
  const written = writeTextDocumentFile({ ...blank, body }, 'docx');
  writeFileSync(path, written.bytes);
}

test('tabs reach their stops: typed at the default stops, and a Word file at its own', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);

  // Where the text after a paragraph's last tab starts and where the paragraph's text ends, from the text area's start.
  const measure = (index: number) =>
    body.evaluate((el, i) => {
      const origin = el.getBoundingClientRect().left;
      const p = el.querySelectorAll('p')[i]!;
      const tabs = p.querySelectorAll<HTMLElement>('.text-document-tab');
      const range = document.createRange();
      range.selectNodeContents(p);
      return {
        after: tabs[tabs.length - 1]!.getBoundingClientRect().right - origin,
        end: range.getBoundingClientRect().right - origin,
        leader: tabs[tabs.length - 1]!.dataset.leader ?? null,
      };
    }, index);

  // Typed: Tab goes to the next half inch (48 px), and again to the next.
  await body.click();
  await page.keyboard.type('Go');
  await page.keyboard.press('Tab');
  await page.keyboard.type('on');
  await expect.poll(async () => Math.round((await measure(0)).after)).toBe(36 * PX);
  await page.keyboard.press('Tab');
  await expect.poll(async () => Math.round((await measure(0)).after)).toBe(72 * PX);
  await expect(body).toBeFocused();
  await expect(body).toContainText('Go\ton\t');

  // A Word file's stops.
  const file = test.info().outputPath('tabs.docx');
  wordFile(file);
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(file);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('tabs');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(body.locator('.text-document-tab')).toHaveCount(3);

  await expect.poll(async () => Math.round((await measure(0)).after)).toBe(144 * PX);
  await expect.poll(async () => Math.round((await measure(1)).end)).toBe(288 * PX);
  expect((await measure(1)).leader).toBe('dot');
  const centre = await measure(2);
  expect(Math.round((centre.after + centre.end) / 2)).toBeGreaterThanOrEqual(216 * PX - 1);
  expect(Math.round((centre.after + centre.end) / 2)).toBeLessThanOrEqual(216 * PX + 1);
  await page.screenshot({ path: test.info().outputPath('tab-stops.png') });
  expectNoPageErrors(pageErrors);
});
