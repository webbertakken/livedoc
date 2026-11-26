import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Suggesting in headers, footers and notes (docs/specs/034-text-documents/review.md "Headers, footers and notes"): an
// Editor in Suggesting opens the header and what they type there is a suggestion, the bar's settings dimmed; Insert >
// Footnote puts in a suggested footnote whose note takes suggestions; a Participant on a share link writes in the same
// header as a suggestion, judged by the room as theirs, and the Editor sees it.

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

async function toSuggesting(page: Page) {
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyX');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await expect(page.getByRole('button', { name: 'Mode: Suggesting' })).toBeVisible();
}

test('suggestions are written in a header and a note, by an Editor and a Participant', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator(READY)).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('A claim worth a source');

  // In Editing, the Editor puts a header in, plainly.
  await (await officeMenuItem(page, ['Insert', 'Headers & footers', 'Header'])).click();
  const header = page.getByRole('textbox', { name: 'Header' });
  await expect(header).toBeFocused();
  await page.keyboard.type('Running head');
  await page.keyboard.press('Escape');
  await body.click();
  await page.keyboard.press('End');

  // In Suggesting, the header opens again and what is typed there is a suggestion; the bar's settings are dimmed.
  await toSuggesting(page);
  await (await officeMenuItem(page, ['Insert', 'Headers & footers', 'Header'])).click();
  await expect(header).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.type(' draft');
  await expect(header.locator('.text-document-insertion')).toHaveText(' draft');
  await expect(page.getByRole('checkbox', { name: 'Different first page' })).toBeDisabled();
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('suggesting-header.png') });
  await page.keyboard.press('Escape');

  // Insert > Footnote while suggesting: the mark a suggested object, the note's writing suggested.
  await body.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Control+Alt+KeyF');
  const note = page.locator('[data-page-notes-of="1"] [data-note-editing] [role="textbox"]');
  await expect(note).toBeFocused();
  await page.keyboard.type('The source');
  await expect(note.locator('.text-document-insertion')).toHaveText('The source');
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('suggesting-footnote.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');

  // A Participant on a share link opens the same header and suggests there; the Editor sees it.
  const id = new URL(page.url()).pathname.split('/')[2]!;
  const origin = new URL(baseURL!).origin;
  const headers = await pageOwnerHeaders(page, { Origin: origin });
  const share = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'participate' },
  });
  const code = ((await share.json()) as { link: { code: string } }).link.code;
  const ctx = await browser.newContext({
    baseURL,
    colorScheme: 'dark',
    viewport: { width: 1440, height: 900 },
  });
  const peer = await ctx.newPage();
  await peer.goto(`/document/shared?s=${code}`);
  const join = peer.getByRole('button', { name: /^join$/i });
  await expect(join.or(peer.locator(READY))).toBeVisible({ timeout: 30_000 });
  if (await join.isVisible()) await join.click();
  await expect(peer.locator(READY)).toBeVisible();
  await expect(peer.getByRole('button', { name: 'Mode: Suggesting' })).toBeVisible();
  await peer.locator(BODY).click();
  await (await officeMenuItem(peer, ['Insert', 'Headers & footers', 'Header'])).click();
  const peerHeader = peer.getByRole('textbox', { name: 'Header' });
  await expect(peerHeader).toBeFocused();
  await peer.keyboard.press('Home');
  await peer.keyboard.type('Ours: ');
  await expect(peerHeader.locator('.text-document-insertion').first()).toHaveText('Ours: ');
  // A Participant puts no footer in: a section's setting.
  await peer.getByRole('menuitem', { name: 'Insert' }).click();
  await peer.getByRole('menuitem', { name: /Headers & footers/ }).hover();
  const footer = peer.getByRole('menuitem', { name: /^Footer/ });
  await expect(footer).toHaveAttribute('aria-disabled', 'true');
  await peer.keyboard.press('Escape');
  await peer.keyboard.press('Escape');

  // The room took the Participant's suggestion: the Editor's page draws it in the header.
  await expect(page.getByText('Ours: Running head draft').first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: test.info().outputPath('suggesting-header-participant.png') });

  expectNoPageErrors(pageErrors);
  await ctx.close();
});
