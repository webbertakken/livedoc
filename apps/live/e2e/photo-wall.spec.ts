import { expect, expectNoPageErrors, test } from './fixtures';
import { openPhotoBoard } from './fixtures/photo-board';
import { wallPhotoPng, type WallNote } from './fixtures/wall-photo';
import { writeZip } from '../lib/zip-writer';

// A whole wall from several photos (docs/specs/021-event-storming/event-storming.md Phase 11), in a real browser: a
// zip of two overlapping photos, picked once, detected one after another, reviewed together, landed as one draft
// with the overlap once and the second photo continuing to the right. The detector is real; the reader is stubbed
// with each photo's words.

test.use({ colorScheme: 'dark' });

const ORANGE = '#fdba74';
// Four notes in a row, the way a photo of one stretch of wall shows them.
const row: WallNote[] = [0, 1, 2, 3].map((i) => ({
  fill: ORANGE,
  x: 40 + i * 220,
  y: 120,
  w: 160,
  h: 160,
}));
const photo = () => wallPhotoPng(940, 400, row);

test('a zip of photos becomes one draft of the whole wall', async ({ page, pageErrors }) => {
  await openPhotoBoard(page, { boundaryModel: false });
  // Photo 1 shows A B C D, photo 2 C D E F: the reader answers each read in turn.
  const words = [
    ['A happened', 'B happened', 'C happened', 'D happened'],
    ['C happened', 'D happened', 'E happened', 'F happened'],
  ];
  let reads = 0;
  await page.route('**/api/ai/read-notes', async (route) => {
    const { crops = [] } = JSON.parse(route.request().postData() ?? '{}') as {
      crops?: { id: number }[];
    };
    const these = words[Math.min(reads, words.length - 1)]!;
    reads += 1;
    await route.fulfill({
      json: { texts: crops.map((c) => ({ id: c.id, text: these[c.id] ?? '', legible: true })) },
    });
  });

  const zip = Buffer.from(
    writeZip([
      { name: 'wall/IMG_10.png', data: photo() },
      { name: 'wall/IMG_9.png', data: photo() },
    ]),
  );
  await page.getByRole('button', { name: /add from photo/i }).click();
  await page.setInputFiles('input[type="file"]', {
    name: 'wall.zip',
    mimeType: 'application/zip',
    buffer: zip,
  });

  const strip = page.getByRole('navigation', { name: 'Photos of the wall' });
  await expect(strip).toBeVisible();
  await expect(page.getByRole('button', { name: 'Photo 1 of 2: IMG_9.png' })).toHaveAttribute(
    'aria-current',
    'step',
  );
  const add = page.getByRole('button', { name: 'Add 6 notes from 2 photos' });
  await expect(add).toBeVisible({ timeout: 30_000 });

  // The second photo marks the two notes the first already shows.
  await page.getByRole('button', { name: 'Photo 2 of 2: IMG_10.png' }).click();
  await expect(page.locator('[data-seen-on="0"]')).toHaveCount(2);

  await add.click();
  const drafts = page.locator('[data-photo-draft]');
  await expect(drafts).toHaveCount(6);
  await page.getByRole('button', { name: /^Add 6 notes$/ }).click();
  await expect(drafts).toHaveCount(0);
  // Left to right as on the wall: the first photo's notes, then the two only the second shows, each once.
  const canvas = page.locator('[data-canvas-a11y-root]');
  const xOf = async (words: string) => {
    const note = canvas.getByRole('img', { name: `Sticky note "${words}"` });
    await expect(note).toHaveCount(1);
    return (await note.boundingBox())!.x;
  };
  const xs = [];
  for (const w of [
    'A happened',
    'B happened',
    'C happened',
    'D happened',
    'E happened',
    'F happened',
  ])
    xs.push(await xOf(w));
  expect(xs).toEqual([...xs].sort((m, n) => m - n));
  expectNoPageErrors(pageErrors);
});

// The board already holds "Order placed", "Payment received" and "Order shipped" (the starter row): photos that show
// them leave them alone, and the overlap between the photos still lands once.
test('photos that partly show the board add only what is new', async ({ page, pageErrors }) => {
  await openPhotoBoard(page, { boundaryModel: false });
  const words = [
    ['Order placed', 'Take payment', 'Payment received', 'Ship order'],
    ['Payment received', 'Ship order', 'Order shipped', 'Notify customer'],
  ];
  let reads = 0;
  await page.route('**/api/ai/read-notes', async (route) => {
    const { crops = [] } = JSON.parse(route.request().postData() ?? '{}') as {
      crops?: { id: number }[];
    };
    const these = words[Math.min(reads, words.length - 1)]!;
    reads += 1;
    await route.fulfill({
      json: { texts: crops.map((c) => ({ id: c.id, text: these[c.id] ?? '', legible: true })) },
    });
  });
  const zip = Buffer.from(
    writeZip([
      { name: '1.png', data: photo() },
      { name: '2.png', data: photo() },
    ]),
  );
  await page.getByRole('button', { name: /add from photo/i }).click();
  await page.setInputFiles('input[type="file"]', {
    name: 'wall.zip',
    mimeType: 'application/zip',
    buffer: zip,
  });
  await page
    .getByRole('button', { name: /^Add \d+ notes from 2 photos$/ })
    .click({ timeout: 30_000 });
  // Take payment, Ship order, Notify customer: the rest are on the board or seen twice.
  await expect(page.locator('[data-photo-draft]')).toHaveCount(3);
  await expect(page.locator('[data-testid="photo-draft-bar"]')).toContainText('3 new');
  expectNoPageErrors(pageErrors);
});
