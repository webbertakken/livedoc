import { lockedPdf, protectedPdf } from '@livedoc/pdf-documents/testing';
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
