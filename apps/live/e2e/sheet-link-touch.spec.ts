import { expect, guestSigFor, mintSignedGuest, ownerHeaders, test } from './fixtures';

// A HYPERLINK in a Sheet on a touch screen (docs/specs/029-sheets/formulas.md "Text", On a touch screen): Ctrl held
// with a tap opens it, as on a tablet with a keyboard, and a plain tap shows its address with Open, which opens it.

test.use({ hasTouch: true, colorScheme: 'dark' });

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
// The grid's header strips (apps/live/components/sheets/sheet-geometry.ts): a tap just past them lands on A1.
const ROW_HEADER_PX = 46;
const COL_HEADER_PX = 22;
const ADDRESS = 'https://docs.nu/';

const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(4, '0')}`);

test('a link in a Sheet opens on a touch screen, with Ctrl and a tap or from its chip', async ({
  page,
  baseURL,
}) => {
  const owner = await mintSignedGuest(page.request);
  const id = crypto.randomUUID();
  const tabId = crypto.randomUUID();
  const sheetId = 'e2elinks01';
  const layout = { rows: ids('r', 10), cols: ids('c', 4) };
  const headers = ownerHeaders(owner, { Origin: new URL(baseURL!).origin });
  const now = Date.now();
  const seeded = await page.request.post(`${apiBase}/documents`, {
    headers,
    data: {
      id,
      name: 'Links',
      tabs: [
        {
          id: tabId,
          name: 'Links',
          kind: 'sheet',
          opensIn: 'plan',
          elements: [
            {
              id: 'sheet',
              type: 'shape',
              shape: 'plan-sheet',
              x: 120,
              y: 260,
              width: 800,
              height: 400,
              planSheet: { sheetId },
            },
          ],
        },
      ],
      sheets: [
        {
          id: sheetId,
          tabId,
          title: 'Links',
          layout,
          cells: [
            {
              r: layout.rows[0],
              c: layout.cols[0],
              i: { f: { t: `HYPERLINK("${ADDRESS}", "LiveDoc")`, r: [] } },
            },
          ],
          rev: 0,
          createdAt: now,
          updatedAt: now,
          updatedBy: { id: owner, name: 'Owner', color: '#0ea5e9' },
        },
      ],
    },
  });
  expect(seeded.ok()).toBe(true);

  await page.addInitScript(
    ({ o, sig }) => {
      localStorage.setItem('livedoc:v2:self-id', o);
      if (sig) localStorage.setItem('livedoc:v2:self-sig', sig);
      localStorage.setItem('livedoc:v2:name-confirmed', '1');
      // What the page opens, kept rather than opened.
      const opened: string[] = [];
      (window as unknown as { __opened: string[] }).__opened = opened;
      window.open = (url?: string | URL) => {
        opened.push(String(url));
        return null;
      };
    },
    { o: owner, sig: guestSigFor(owner) },
  );
  await page.setViewportSize({ width: 1317, height: 752 });
  await page.goto(`/document/${id}`);
  const grid = page.getByRole('grid', { name: 'Links grid' });
  await expect(grid).toContainText('LiveDoc');
  const box = (await grid.boundingBox())!;
  const a1 = { x: box.x + ROW_HEADER_PX + 20, y: box.y + COL_HEADER_PX + 8 };
  const opened = () => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);

  // A plain tap selects the link and shows its address with Open.
  await page.touchscreen.tap(a1.x, a1.y);
  const chip = page.getByRole('group', { name: 'Link' });
  await expect(chip).toContainText(ADDRESS);
  expect(await opened()).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('link-chip.png') });
  await chip.getByRole('button', { name: 'Open' }).tap();
  await expect.poll(opened).toEqual([ADDRESS]);
  await expect(chip).toHaveCount(0);

  // Ctrl held with a tap opens it at once, as on a tablet with a keyboard.
  await page.keyboard.down('Control');
  await page.touchscreen.tap(a1.x, a1.y);
  await page.keyboard.up('Control');
  await expect.poll(opened).toEqual([ADDRESS, ADDRESS]);
});
