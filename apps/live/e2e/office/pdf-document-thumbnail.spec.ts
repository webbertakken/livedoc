import type { Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { dragAcrossFirstLine, dropPdf, PAGE_ONE, pageOneDrawn } from './pdf-document-pages';

// A PDF document's thumbnail (docs/specs/035-pdf-documents/live-editing-and-storage.md "A browser's thumbnail";
// docs/specs/006-document/document-snapshots.md), in a real browser with its own canvas: LiveDoc's servers hold no
// PDF engine, so an Editor's open surface sends the first page, on white, with the live marks over it. The api then
// answers every list with a white page holding that picture.

test.use({ colorScheme: 'dark' });

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
const MARKS = `${PAGE_ONE} [data-pdf-mark]`;
const NAME = 'Service agreement';

/** What the picture inside a thumbnail's SVG holds: its size, its corner's colour, and how much of it is highlighted. */
const pictureIn = (page: Page, svg: string) =>
  page.evaluate(async (markup) => {
    const href = /href="(data:image\/jpeg;base64,[^"]+)"/.exec(markup)?.[1];
    if (!href) return null;
    const image = new Image();
    image.src = href;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let highlighted = 0;
    // A highlight multiplied onto white paper: red and green stay high, blue falls.
    for (let at = 0; at < data.length; at += 4)
      if (data[at]! > 200 && data[at + 1]! > 200 && data[at + 2]! < 190) highlighted += 1;
    return {
      width: canvas.width,
      height: canvas.height,
      corner: [data[0]!, data[1]!, data[2]!],
      highlighted,
    };
  }, svg);

test('an Editor’s open PDF sends its first page, marks included, for the lists to draw', async ({
  page,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(180_000);
  const headers = async () => pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });
  const thumbnail = async (id: string) =>
    page.request.get(`${apiBase}/documents/${id}/thumbnail`, { headers: await headers() });
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, `${NAME}.pdf`, await textPdf(2));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const id = new URL(page.url()).pathname.split('/')[2]!;

  // Asked on open, wanted, sent: the api answers a white page holding a JPEG of the first page.
  await expect.poll(async () => (await thumbnail(id)).status(), { timeout: 30_000 }).toBe(200);
  const plain = await thumbnail(id);
  expect(plain.headers()['content-type']).toContain('image/svg+xml');
  const before = await pictureIn(page, await plain.text());
  expect(before).toMatchObject({ width: 480, highlighted: 0 });
  // Light paper, whatever the scheme: the page's corner is white.
  for (const channel of before!.corner) expect(channel).toBeGreaterThan(240);

  // A highlight, saved by the room; once the room has written the document's save, a picture is wanted again.
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  await dragAcrossFirstLine(page, first);
  await expect(page.locator(MARKS)).toHaveCount(1);
  const document = (await (
    await page.request.get(`${apiBase}/documents/${id}`, { headers: await headers() })
  ).json()) as { tabs: { id: string }[] };
  const wanted = async () => {
    const res = await page.request.get(
      `${apiBase}/documents/${id}/pdf-documents/${document.tabs[0]!.id}/thumbnail`,
      { headers: await headers() },
    );
    return res.ok() ? ((await res.json()) as { wanted: boolean }).wanted : null;
  };
  await expect.poll(wanted, { timeout: 90_000, intervals: [1_000] }).toBe(true);

  // An Editor who opens the PDF now is asked for one, and sends the page with its highlight. (The surface that made
  // the highlight sends it by itself too, a minute after its last picture at most.)
  await page.reload();
  await pageOneDrawn(page);
  await expect(page.locator(MARKS)).toHaveCount(1);
  await expect
    .poll(
      async () => (await pictureIn(page, await (await thumbnail(id)).text()))?.highlighted ?? 0,
      {
        timeout: 60_000,
        intervals: [1_000],
      },
    )
    .toBeGreaterThan(200);
  expect(await wanted()).toBe(false);

  // The Explorer's row draws it.
  await page.goto('/explorer/all');
  const row = page.locator('img[src^="blob:"]').first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: test.info().outputPath('pdf-thumbnail-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(row).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('pdf-thumbnail-light.png') });
  expectNoPageErrors(pageErrors);
});
