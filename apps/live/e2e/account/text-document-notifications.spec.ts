import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from '../office/office-menus';
import { signIn } from './sign-in';
import { BODY, READY } from './text-document-team';

// A text document's notification settings (docs/specs/034-text-documents/review.md "Notifications"): signed in, where
// email is configured, Tools > Notification settings reads the person's setting for this document, keeps a choice on
// OK, and reads it back after a reload; an email's settings link that is not valid says so, signed out.

test.use({ colorScheme: 'dark', viewport: { width: 1440, height: 900 } });

test('a text document’s notification settings are chosen and kept', async ({
  page,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem('livedoc:v2:name-confirmed', '1'));
  await signIn(page.context(), { baseURL: baseURL!, name: 'Ann Tester' });
  await page.goto('/new?kind=text-document');
  await expect(page.locator(READY)).toBeVisible({ timeout: 30_000 });
  await page.locator(BODY).click();
  await page.keyboard.type('Minutes of the meeting.');

  // The defaults: comments for you, no edits.
  await (await officeMenuItem(page, ['Tools', 'Notification settings'])).click();
  const dialog = page.getByRole('dialog', { name: 'Notification settings' });
  const comments = dialog.getByRole('group', { name: 'Comments' });
  const edits = dialog.getByRole('group', { name: 'Edits' });
  await expect(comments.getByRole('radio', { name: 'Comments for you' })).toBeChecked();
  await expect(comments.getByRole('radio', { name: 'Comments for you' })).toBeEnabled();
  await expect(edits.getByRole('radio', { name: 'None' })).toBeChecked();

  await comments.getByRole('radio', { name: 'All comments' }).check();
  await edits.getByRole('radio', { name: 'Added or removed content' }).check();
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('notification-settings-dialog.png') });
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(dialog).toHaveCount(0);

  // Kept: a reload reads the choice back.
  await page.reload();
  await expect(page.locator(READY)).toBeVisible({ timeout: 30_000 });
  await (await officeMenuItem(page, ['Tools', 'Notification settings'])).click();
  await expect(comments.getByRole('radio', { name: 'All comments' })).toBeChecked();
  await expect(comments.getByRole('radio', { name: 'All comments' })).toBeEnabled();
  await expect(edits.getByRole('radio', { name: 'Added or removed content' })).toBeChecked();

  // Cancel keeps nothing.
  await comments.getByRole('radio', { name: 'None' }).check();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await (await officeMenuItem(page, ['Tools', 'Notification settings'])).click();
  await expect(comments.getByRole('radio', { name: 'All comments' })).toBeChecked();
  expectNoPageErrors(pageErrors);
});

test('an email’s settings link that is not valid says so, signed out', async ({
  page,
  pageErrors,
}) => {
  await page.goto('/notification-settings?token=not-a-real-token');
  await expect(page.getByRole('heading', { name: /^This Link Isn’t Valid$/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('link', { name: 'Open Settings' })).toHaveAttribute(
    'href',
    /\/explorer\?settings=notifications$/,
  );
  await page.screenshot({ path: test.info().outputPath('notification-link-invalid.png') });
  expectNoPageErrors(pageErrors);
});
