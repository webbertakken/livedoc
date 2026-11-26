import { expect, expectNoPageErrors, test } from '../fixtures';
import type { Account } from './sign-in';
import { BODY, teamTextDocument } from './text-document-team';

// Mentions and assigning on a text document's comments, signed in (docs/specs/034-text-documents/review.md
// "Mentions", "Assigning"): on a document in a team's library, `+` in a draft lists the team's members; picking one
// draws a chip; a mention emails them; ticking "Assign to <name>" assigns the thread, which then leads with "Assigned
// to <name>", reads "Mark as done", and emails the assignee as an assigned action.

test.use({ colorScheme: 'dark', viewport: { width: 1440, height: 900 } });

/** The newest email the stack's outbox holds for `email`, once its subject matches. */
async function newestMail(who: Account, email: string, subject: RegExp) {
  await expect
    .poll(
      async () => {
        const res = await who.request.get(`/api/preview/outbox?to=${encodeURIComponent(email)}`);
        return res.ok() ? ((await res.json()) as { subject: string }).subject : '';
      },
      { timeout: 20_000 },
    )
    .toMatch(subject);
}

test('a teammate is mentioned and assigned a text document’s comment, and emailed each time', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  const { ann, bob, bobContext } = await teamTextDocument(
    page,
    browser,
    baseURL!,
    'The quarterly results are in.',
  );
  await bobContext.close();

  // A draft on "quarterly": `+` lists Bob; picking him draws his handle; the mention emails him.
  const body = page.locator(BODY);
  await body.getByText('The quarterly results are in.').dblclick();
  await page.keyboard.press('Control+Alt+KeyM');
  const draft = page.getByRole('group', { name: 'New comment' });
  await expect(draft.getByRole('textbox', { name: 'Add a comment' })).toBeFocused();
  await page.keyboard.type('Please check +bo');
  await expect(draft.getByRole('option', { name: /Bob Tester/ })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Enter');
  await expect(draft.getByRole('checkbox', { name: 'Assign to Bob Tester' })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('comment-assign-offer.png') });
  await draft.getByRole('button', { name: 'Comment' }).click();
  const card = page.locator('[data-thread-card]:not([data-thread-card="draft"])');
  await expect(card.getByText('@bob-tester')).toHaveClass(/rounded-control/);
  await expect(card.getByText(/^Assigned to/)).toHaveCount(0);
  await newestMail(ann, bob.email, /mentioned you/);

  // A reply that assigns him: the same words, so the mention is not emailed twice, and the assignment is.
  await card.click();
  const reply = card.getByRole('textbox', { name: 'Add a comment' });
  await reply.click();
  await page.keyboard.type('Please check +bo');
  await expect(card.getByRole('option', { name: /Bob Tester/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await card.getByRole('checkbox', { name: 'Assign to Bob Tester' }).check();
  await card.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(card.getByText('Assigned to Bob Tester')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Mark as done' })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('comment-assigned.png') });
  await newestMail(ann, bob.email, /assigned you/);
  expectNoPageErrors(pageErrors);
});
