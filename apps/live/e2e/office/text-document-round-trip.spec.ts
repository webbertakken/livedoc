import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { libreOfficeConvert } from './libreoffice';

// A text document end to end (docs/specs/034-text-documents/text-document.md,
// live-editing-and-storage.md, files-and-print.md): a new text document, stored in its room, typed into together in
// two browsers, downloaded as ODF, opened and saved again by LibreOffice, and opened back here unchanged.

const BODY = '[role="textbox"][aria-label="Document body"]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

async function peerOn(browser: Browser, baseURL: string, code: string): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL,
    colorScheme: 'dark',
    viewport: { width: 1280, height: 860 },
  });
  const page = await ctx.newPage();
  await page.goto(`/document/shared?s=${code}`);
  // A visitor joins under a name when the welcome asks for one; the body shows either way.
  const join = page.getByRole('button', { name: /^join$/i });
  await expect(join.or(page.locator(BODY))).toBeVisible();
  if (await join.isVisible()) await join.click();
  return page;
}

test('a text document typed together leaves as ODF, survives LibreOffice and comes back unchanged', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  const body = page.locator(BODY);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await body.click();
  await page.keyboard.type('Minutes of the meeting.');
  const id = new URL(page.url()).pathname.split('/')[2]!;

  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });
  const share = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'edit' },
  });
  const code = ((await share.json()) as { link: { code: string } }).link.code;
  const peer = await peerOn(browser, baseURL!, code);
  await expect(peer.locator(BODY)).toHaveText('Minutes of the meeting.');

  // Both type into the one paragraph at once, the peer at its start and the owner at its end: every character of
  // both stays, on both screens.
  await peer.locator(BODY).click();
  await peer.keyboard.press('Home');
  await Promise.all([page.keyboard.type(' Owner here.'), peer.keyboard.type('Peer here. ')]);
  const typed = 'Peer here. Minutes of the meeting. Owner here.';
  await expect(page.locator(BODY)).toHaveText(typed);
  await expect(peer.locator(BODY)).toHaveText(typed);
  // The owner sees the peer's caret in the writing (live-editing-and-storage.md "Presence"). (The owner's own goes
  // out once its editor knows the document is shared; this test shares it behind the editor's back, by the api.)
  await expect(page.locator('.text-document-peer-caret')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('carets.png') });

  // Downloaded as ODF: LibreOffice reads the same words.
  await page.getByRole('button', { name: 'File' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Download as OpenDocument (.odt)' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Untitled document.odt');
  const dir = mkdtempSync(join(tmpdir(), 'text-document-'));
  const odt = join(dir, 'Minutes.odt');
  await download.saveAs(odt);
  expect(
    libreOfficeConvert(odt, 'txt:Text')
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .trim(),
  ).toBe(typed);

  // Saved again by LibreOffice, then opened here: the same words, in a new text document.
  const resaved = join(dir, 'Minutes from LibreOffice.odt');
  writeFileSync(resaved, libreOfficeConvert(odt, 'odt:writer8'));
  await page.getByRole('button', { name: 'File' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: 'Open', exact: true }).click(),
  ]);
  await chooser.setFiles(resaved);
  await page.waitForURL((url) => !url.pathname.includes(id));
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(body).toHaveText(typed);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Minutes from LibreOffice');
  expectNoPageErrors(pageErrors);
});
