import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test, untilHydrated } from '../fixtures';
import { officeMenuItem } from './office-menus';

// The template gallery's text documents (docs/specs/034-text-documents/starting-and-finding.md "The template gallery's
// text documents", "Where the gallery shows"): Text document's pane in the Explorer's New Document menu lists the
// gallery's sections with each template's first page, and a card makes a document named after the template holding
// its writing; `/new?template=<id>` makes one too.

test.use({ colorScheme: 'dark' });

const SHOTS = process.env.E2E_SHOTS_DIR;
const TEXT_READY = '[data-text-document-surface="ready"]';

const nameOf = (page: Page) =>
  page
    .getByRole('banner')
    .filter({ has: page.getByRole('menubar') })
    .getByRole('textbox', { name: 'Rename' });

test('the Explorer’s Text document pane lists the gallery, and a card makes that template', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/explorer/home');
  const more = page.getByRole('button', { name: 'More new document choices' });
  await untilHydrated(more);
  await more.click();
  await page.getByRole('menuitem', { name: 'Text document, blank' }).hover();
  const pane = page.getByRole('group', { name: 'Text document templates' });
  await expect(pane.getByRole('heading')).toHaveText([
    'Letters',
    'Resumes',
    'Personal',
    'Work',
    'Education',
  ]);
  // Each card's picture is its first page on dark paper, drawn once the pane shows.
  await expect(pane.locator('img:visible')).toHaveCount(15, { timeout: 30_000 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/pane-dark.png` });
  await page.emulateMedia({ colorScheme: 'light' });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/pane-light.png` });

  await pane.getByRole('menuitem', { name: 'Letter', exact: true }).click();
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await expect(page.locator(TEXT_READY)).toBeVisible({ timeout: 30_000 });
  await expect(nameOf(page)).toHaveValue('Letter');
  await expect(page.locator(TEXT_READY)).toContainText('Alex Morgan');
  await expect(page.locator(TEXT_READY)).toContainText('Kind regards,');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/letter-light.png` });
  expectNoPageErrors(pageErrors);
});

test('/new?template= makes a text document from its template, kept on reload', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?template=text-project-brief');
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await expect(page.locator(TEXT_READY)).toBeVisible({ timeout: 30_000 });
  await expect(nameOf(page)).toHaveValue('Project brief');
  await expect(page.locator(TEXT_READY)).toContainText('Open questions');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/project-brief-dark.png` });
  await page.reload();
  await expect(page.locator(TEXT_READY)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(TEXT_READY)).toContainText('A plan is a guess written down');
  expectNoPageErrors(pageErrors);
});

test('File > New opens the gallery’s page in a new tab, where a card makes that template', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await expect(page.locator(TEXT_READY)).toBeVisible({ timeout: 30_000 });
  const [gallery] = await Promise.all([
    page.context().waitForEvent('page'),
    (await officeMenuItem(page, ['File', 'New', 'From template gallery'])).click(),
  ]);
  await gallery.waitForURL(/\/new\?gallery=text-document/);
  await expect(gallery.getByRole('heading', { level: 1 })).toHaveText('Template gallery');
  await expect(gallery.locator('main img:visible')).toHaveCount(15, { timeout: 30_000 });
  if (SHOTS) await gallery.screenshot({ path: `${SHOTS}/gallery-dark.png` });
  await gallery.emulateMedia({ colorScheme: 'light' });
  if (SHOTS) await gallery.screenshot({ path: `${SHOTS}/gallery-light.png` });
  await gallery.setViewportSize({ width: 390, height: 844 });
  if (SHOTS) await gallery.screenshot({ path: `${SHOTS}/gallery-phone.png` });
  await gallery.setViewportSize({ width: 1440, height: 900 });
  await gallery.getByRole('button', { name: 'Essay' }).click();
  await gallery.waitForURL(/\/document\//, { timeout: 30_000 });
  await expect(gallery.locator(TEXT_READY)).toBeVisible({ timeout: 30_000 });
  await expect(nameOf(gallery)).toHaveValue('Essay');
  // Back returns to the gallery the choice was made in.
  await gallery.goBack();
  await expect(gallery.getByRole('heading', { level: 1 })).toHaveText('Template gallery');
  expectNoPageErrors(pageErrors);
});
