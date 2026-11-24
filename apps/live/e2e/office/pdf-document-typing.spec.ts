import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { dropPdf, PAGE_ONE, pageOneDrawn } from './pdf-document-pages';

// Text and Callout end to end (docs/specs/035-pdf-documents/marks.md "Making a mark": a Text by a press, opened for
// typing at once; Escape with nothing typed makes nothing; a Callout by a press on what is meant, then a press for its
// words; a press elsewhere ends the typing and makes nothing else; "In the file"; keyboard-shortcuts.md "Tools": X and
// ⇧X): undo takes one back; the download holds each as a FreeText.

/** A press on page one at a point given as fractions of its box, kept within the window. */
async function pressAt(page: Page, first: Locator, [x, y]: [number, number]) {
  const box = (await first.boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}

test('a Text and a Callout are typed onto a page and leave as FreeText annotations', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  const stored = await textPdf(2);
  await dropPdf(page, 'Typing.pdf', stored);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const kind = (name: string) => page.locator(`${PAGE_ONE} [data-pdf-mark-kind="${name}"]`);
  const tool = page.locator('[data-pdf-tool]');
  const typing = page.locator(`${PAGE_ONE} textarea[data-pdf-typing]`);

  // X takes the Text control's tool, Text at first; the control shows it pressed.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('x');
  await expect(tool).toHaveAttribute('data-pdf-tool', 'text');
  await expect(page.getByRole('button', { name: 'Text', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // A press opens a box for typing at once; Enter is a new line; Escape ends it, the tool still in hand.
  await pressAt(page, first, [0.12, 0.12]);
  await expect(typing).toBeFocused();
  await page.keyboard.type('Check the totals');
  await page.keyboard.press('Enter');
  await page.keyboard.type('before Friday');
  await page.keyboard.press('Escape');
  await expect(typing).toHaveCount(0);
  await expect(kind('text').locator('text')).toHaveText(['Check the totals', 'before Friday']);
  await expect(tool).toHaveAttribute('data-pdf-tool', 'text');

  // Escape with nothing typed makes nothing.
  await pressAt(page, first, [0.5, 0.12]);
  await expect(typing).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(typing).toHaveCount(0);
  await expect(kind('text')).toHaveCount(1);

  // ⇧X: the Callout. A press on what is meant, then a press where its words go.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('Shift+X');
  await expect(tool).toHaveAttribute('data-pdf-tool', 'callout');
  await pressAt(page, first, [0.75, 0.32]);
  await expect(page.locator(`${PAGE_ONE} [data-pdf-typing-draft="drawing"]`)).toHaveCount(1);
  await pressAt(page, first, [0.45, 0.22]);
  await expect(typing).toBeFocused();
  await page.keyboard.type('Where is this from?');
  // A press elsewhere ends the typing and opens nothing else.
  await pressAt(page, first, [0.2, 0.36]);
  await expect(typing).toHaveCount(0);
  await expect(kind('callout').locator('text')).toHaveText('Where is this from?');
  await expect(kind('callout').locator('polyline')).toHaveCount(2);
  await page.screenshot({ path: test.info().outputPath('pdf-typing.png') });

  // Insert > Text takes Text again.
  await (await officeMenuItem(page, ['Insert', 'Text'])).click();
  await expect(tool).toHaveAttribute('data-pdf-tool', 'text');

  // Undo takes the Callout back; redo makes it again.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(kind('callout')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(kind('callout')).toHaveCount(1);

  // Downloaded: a valid PDF holding each as a FreeText, appended to the file.
  const item = await officeMenuItem(page, ['File', 'Download', 'PDF']);
  const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pdf-typing-')), 'Typing.pdf');
  await download.saveAs(file);
  const added = readFileSync(file).subarray(stored.length).toString('latin1');
  for (const entry of ['/FreeText', '/FreeTextCallout', '/DA (/Helv 12 Tf'])
    expect(added).toContain(entry);
  execFileSync('qpdf', ['--check', file], { stdio: 'pipe' });
  expectNoPageErrors(pageErrors);
});
