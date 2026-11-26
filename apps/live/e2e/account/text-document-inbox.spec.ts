import { expect, expectNoPageErrors, test } from '../fixtures';
import { BODY, teamTextDocument } from './text-document-team';

// A text document's threads in the Inbox (docs/specs/013-workspace/inbox.md §2.7, §1.5, §1.8): a comment that
// assigns a teammate reaches their Inbox as an action and the thread they are mentioned in, both on the text it is
// on; the pane offers Open alone, and Open lands on the thread, its card given the keyboard.

test.use({ colorScheme: 'dark', viewport: { width: 1440, height: 900 } });

test('a comment assigned on a text document lists in the teammate’s Inbox, and Open lands on it', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(180_000);
  const { bob, bobContext, id } = await teamTextDocument(
    page,
    browser,
    baseURL!,
    'The quarterly results are in.',
  );

  // Ann comments on the whole sentence, assigning Bob.
  await page.locator(BODY).click();
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.press('Control+Alt+KeyM');
  const draft = page.getByRole('group', { name: 'New comment' });
  await expect(draft.getByRole('textbox', { name: 'Add a comment' })).toBeFocused();
  await page.keyboard.type('Please check the totals +bo');
  await expect(draft.getByRole('option', { name: /Bob Tester/ })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Enter');
  await draft.getByRole('checkbox', { name: 'Assign to Bob Tester' }).check();
  await draft.getByRole('button', { name: 'Comment' }).click();
  await expect(page.getByText('Assigned to Bob Tester')).toBeVisible();

  // The room pushes the tab once it is idle: Bob's Inbox read lists the action and the thread, anchored to text.
  await expect
    .poll(
      async () => {
        const res = await bob.request.get('/api/activity', { headers: await bob.apiHeaders() });
        if (!res.ok()) return '';
        const feed = (await res.json()) as {
          actions: { documentId: string; anchor: string; name: string; assignedToMe: boolean }[];
          threads: {
            documentId: string;
            anchor: string;
            elementLabel: string;
            mentionsYou: boolean;
          }[];
        };
        const action = feed.actions.find((a) => a.documentId === id);
        const thread = feed.threads.find((t) => t.documentId === id);
        return JSON.stringify({
          // A handle carries the account's own suffix.
          action: action && [
            action.anchor,
            action.name.replace(/@bob-tester\S*/, '@bob-tester'),
            action.assignedToMe,
          ],
          thread: thread && [thread.anchor, thread.elementLabel, thread.mentionsYou],
        });
      },
      { timeout: 90_000, intervals: [2_000] },
    )
    .toBe(
      JSON.stringify({
        action: ['text', 'Please check the totals @bob-tester', true],
        thread: ['text', 'The quarterly results are in.', true],
      }),
    );

  // On his Inbox page the assigned comment offers Open alone, and Open lands on the thread.
  const inbox = await bobContext.newPage();
  await inbox.goto('/explorer/inbox');
  const row = inbox.getByRole('option', { name: /Please check the totals/ });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  const reader = inbox.locator('[data-inbox-reader]');
  const verbs = reader.locator('[data-inbox-verbs]');
  await expect(verbs.getByRole('link', { name: /Open/ })).toBeVisible();
  await expect(verbs.getByRole('button')).toHaveCount(0);
  await inbox.waitForTimeout(300);
  await inbox.screenshot({ path: test.info().outputPath('inbox-text-thread.png') });
  await verbs.getByRole('link', { name: /Open/ }).click();
  await expect(inbox.locator('[data-text-document-surface="ready"]')).toBeVisible({
    timeout: 30_000,
  });
  const card = inbox.locator('[data-thread-card]:not([data-thread-card="draft"])');
  await expect(card).toBeFocused({ timeout: 15_000 });
  await expect(card.getByText('Assigned to you')).toBeVisible();
  await inbox.waitForTimeout(300);
  await inbox.screenshot({ path: test.info().outputPath('inbox-open-lands.png') });
  await bobContext.close();
  expectNoPageErrors(pageErrors);
});
