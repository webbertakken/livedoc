import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { dragAcrossFirstLine, dropPdf, PAGE_ONE, pageOneDrawn } from './pdf-document-pages';

// The four text marks end to end (docs/specs/035-pdf-documents/marks.md "Making a mark", "In the file";
// reading-surface.md "The toolbar"; keyboard-shortcuts.md "Tools"): a Squiggly underline taken from the Insert menu
// and dragged across a line, a Strikethrough from the Highlight control's chevron, which then shows it, ⇧U's cycle,
// a selection marked by U and by the context menu, each drawn as its kind, and the download holding each as its
// standard annotation.

test('the four text marks are made from the menus, the chevron, the keys and a selection, and leave in the file', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  const stored = await textPdf(2);
  await dropPdf(page, 'Lease.pdf', stored);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const marks = page.locator(`${PAGE_ONE} [data-pdf-mark]`);
  const tool = page.locator('[data-pdf-tool]');
  // The kinds on page one, in no order: the marks are drawn as the document's changes hold them.
  const kinds = () =>
    marks.evaluateAll((all) => all.map((mark) => mark.getAttribute('data-pdf-mark-kind')).sort());

  // Insert > Squiggly underline takes the tool in hand; a drag across the line marks it with a zigzag.
  await (await officeMenuItem(page, ['Insert', 'Squiggly underline'])).click();
  await expect(tool).toHaveAttribute('data-pdf-tool', 'squiggly');
  await dragAcrossFirstLine(page, first, { from: 2, to: 60 });
  await expect(marks).toHaveCount(1);
  await expect(marks).toHaveAttribute('data-pdf-mark-kind', 'squiggly');
  expect(
    (await marks.locator('polyline').first().getAttribute('points'))!.split(' ').length,
  ).toBeGreaterThan(4);

  // The chevron beside Highlight holds Underline and Strikethrough; the one taken shows on the button.
  await page.getByRole('button', { name: 'Highlight styles' }).click();
  await page.getByRole('menuitemradio', { name: 'Strikethrough' }).click();
  await expect(tool).toHaveAttribute('data-pdf-tool', 'strikeout');
  const control = page.locator('[data-office-control="text-mark-tools"]');
  await expect(control).toHaveAccessibleName('Strikethrough');
  await expect(control).toHaveAttribute('aria-pressed', 'true');
  await dragAcrossFirstLine(page, first, { from: 70, to: 130 });
  await expect.poll(kinds).toEqual(['squiggly', 'strikeout']);
  await page.screenshot({ path: test.info().outputPath('pdf-text-marks-strikethrough.png') });

  // ⇧U cycles Highlight, Underline, Strikethrough: from Strikethrough, Highlight, then Underline.
  await page.keyboard.press('Shift+U');
  await expect(tool).toHaveAttribute('data-pdf-tool', 'highlight');
  await page.keyboard.press('Shift+U');
  await expect(tool).toHaveAttribute('data-pdf-tool', 'underline');
  await dragAcrossFirstLine(page, first, { from: 140, to: 200 });
  await expect.poll(kinds).toEqual(['squiggly', 'strikeout', 'underline']);

  // With Select in hand, text selected and U pressed: the selection is highlighted, and Select stays in hand.
  await page.keyboard.press('v');
  await expect(tool).toHaveAttribute('data-pdf-tool', 'select');
  await dragAcrossFirstLine(page, first, { from: 2, to: 100 });
  await expect(page.locator(`${PAGE_ONE} [data-pdf-text-selection]`)).toHaveCount(1);
  await page.keyboard.press('u');
  await expect.poll(kinds).toEqual(['highlight', 'squiggly', 'strikeout', 'underline']);
  await expect(tool).toHaveAttribute('data-pdf-tool', 'select');
  await expect(page.locator(`${PAGE_ONE} [data-pdf-text-selection]`)).toHaveCount(0);

  // The context menu on a selection offers Underline too.
  await dragAcrossFirstLine(page, first, { from: 100, to: 200 });
  await first.click({ button: 'right', position: { x: 120, y: 80 } });
  await page.getByRole('menuitem', { name: 'Underline', exact: true }).click();
  await expect
    .poll(kinds)
    .toEqual(['highlight', 'squiggly', 'strikeout', 'underline', 'underline']);
  await page.screenshot({ path: test.info().outputPath('pdf-text-marks.png') });

  // Downloaded: a valid PDF holding each kind as its standard annotation, appended to the file.
  const item = await officeMenuItem(page, ['File', 'Download', 'PDF']);
  const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pdf-text-marks-')), 'Lease.pdf');
  await download.saveAs(file);
  const added = readFileSync(file).subarray(stored.length).toString('latin1');
  for (const subtype of ['/Squiggly', '/StrikeOut', '/Underline', '/Highlight'])
    expect(added, subtype).toContain(subtype);
  execFileSync('qpdf', ['--check', file], { stdio: 'pipe' });
  expectNoPageErrors(pageErrors);
});
