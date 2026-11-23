import { lockedPdf, protectedPdf, spoiled, textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dropPdf, pageOneDrawn } from './pdf-document-pages';

// Opening a protected PDF and a refused one (docs/specs/035-pdf-documents/opening.md "Passwords", "Refusals",
// "Keyboard and accessibility"): the open password is asked on the pages' place with the field in focus, a wrong one
// is said and the field keeps focus, the right one opens the pages; a refusal is a region headed by its sentence.

test('a protected PDF asks for its password, says a wrong one, and opens with the right one', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Lease.pdf', await protectedPdf({ userPassword: 'open sesame' }));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });

  await expect(page.locator('[data-pdf-surface="locked"]')).toBeVisible({ timeout: 30_000 });
  const screen = page.getByRole('region', { name: 'This PDF is protected.' });
  const field = screen.getByLabel('Password');
  await expect(field).toBeFocused();
  await expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled();
  await expect(screen.getByRole('button', { name: 'Download' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('pdf-password-dark.png') });

  await field.fill('swordfish');
  await page.keyboard.press('Enter');
  await expect(screen.getByRole('alert')).toHaveText("That password didn't open this PDF.");
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  // The check is over: Open takes the next password.
  const open = screen.getByRole('button', { name: 'Open' });
  await expect(open).toBeEnabled();
  await expect(open).toHaveCSS('opacity', '1');
  await page.screenshot({ path: test.info().outputPath('pdf-password-wrong-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: test.info().outputPath('pdf-password-wrong-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });

  // Typing again replaces what was selected.
  await page.keyboard.type('open sesame');
  await page.keyboard.press('Enter');
  await pageOneDrawn(page);
  await expect(page.getByLabel(/^Protected PDF [\d.]+, 2 pages, \d+ kB$/)).toHaveText('PDF');

  expectNoPageErrors(pageErrors);
});

test('a PDF encrypted to certificates is refused by name, with Download', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Sealed.pdf', lockedPdf('/Adobe.PubSec'));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });

  await expect(page.locator('[data-pdf-surface="refused:pdf_certificate_protected"]')).toBeVisible({
    timeout: 30_000,
  });
  const region = page.getByRole('region', {
    name: "This PDF is locked to specific people's certificates, which LiveDoc doesn't open.",
  });
  await expect(region.getByRole('button', { name: 'Download' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('pdf-refused-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: test.info().outputPath('pdf-refused-light.png') });

  expectNoPageErrors(pageErrors);
});

// "Passwords": a file that forbids changes opens in Viewing with its notice; its permissions password, given in the
// shell's dialog, lifts the limits for this person, and a password that lifts nothing is said.
test('a PDF that asks not to be changed opens in Viewing until its permissions password is given', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  const asking = await protectedPdf({
    ownerPassword: 'owner',
    permissions: { modify: false, annotate: false, fillForms: false, assemble: false },
  });
  await dropPdf(page, 'Notice.pdf', asking);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);

  await expect(page.getByRole('button', { name: 'Mode: Viewing' })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'This PDF asks not to be changed.' }),
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('pdf-limits-notice-dark.png') });

  await page.getByRole('button', { name: 'Enter permissions password' }).click();
  const dialog = page.getByRole('dialog', { name: 'Permissions password' });
  const field = dialog
    .getByLabel('Permissions password', { exact: true })
    .and(dialog.locator('input'));
  await expect(field).toBeFocused();
  await field.fill('not it');
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('alert')).toHaveText(
    "That password didn't lift this PDF's limits.",
  );
  await expect(field).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('pdf-limits-wrong-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: test.info().outputPath('pdf-limits-wrong-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });

  await page.keyboard.type('owner');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByText('This PDF asks not to be changed.')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Mode: Reviewing' })).toBeVisible();

  expectNoPageErrors(pageErrors);
});

// "Damaged files": a file the engine rebuilds opens, and once its first page shows the notice says it was repaired;
// Details names what was rebuilt and how changes are saved.
test('a damaged PDF opens repaired, and says so with its Details', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Damaged.pdf', spoiled(await textPdf(2)));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);

  const notice = page.getByRole('status').filter({ hasText: 'This PDF was damaged.' });
  await expect(notice).toContainText('Changes to this PDF are saved as a repaired copy.');
  await page.screenshot({ path: test.info().outputPath('pdf-repaired-dark.png') });
  await notice.getByRole('button', { name: 'Details' }).click();
  const details = page.getByRole('dialog', { name: 'Repaired PDF' });
  await expect(details).toContainText(
    "LiveDoc rebuilt this PDF's index of where each part of the file lies",
  );
  // The dialog's entrance has played out before it is pictured.
  await page.evaluate(() => Promise.all(document.getAnimations().map((motion) => motion.finished)));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: test.info().outputPath('pdf-repaired-details-light.png') });
  await details.getByRole('button', { name: 'Close' }).click();
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice).toBeHidden();

  expectNoPageErrors(pageErrors);
});
