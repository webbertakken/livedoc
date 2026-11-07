import { enableDebugLogs, expect, expectNoPageErrors, test } from './fixtures';
import {
  installOpenProbe,
  median,
  NEW_DOCUMENT_OPEN_BUDGET_MS,
  NEW_DOCUMENT_TEMPLATE_BUDGET_MS,
  openBlank,
  openExplorer,
  openKanban,
} from './new-document-open';

// Opening at once (docs/specs/013-workspace/new-document-menu.md), on a host without sign-in,
// where everyone's documents are LiveDoc's: against the production build, a blank is editable within 200 ms of the
// click and a template within 500 ms, with nothing fetched first; Back returns to the Explorer, and the document was
// made. The signed-in and This Browser halves run on the signed-in stack (account/new-document-open-budget.spec.ts).

const RUNS = 3;

test.beforeEach(async ({ page, context }) => {
  await enableDebugLogs(context);
  await installOpenProbe(page);
});

test('a blank opens editable within its budget, its start closed, and Back returns', async ({
  page,
  pageErrors,
}) => {
  const times: number[] = [];
  const landed: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('[new-document] create-landed')) landed.push(m.text());
  });
  for (let run = 0; run < RUNS; run++) {
    await openExplorer(page);
    times.push(await openBlank(page));
    await expect(page.getByRole('dialog', { name: /Start Diagramming/ })).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/explorer\/home$/);
    await expect(page.getByRole('button', { name: 'New Diagram' })).toBeVisible();
    // Landed before the next page load, which would cut the create short.
    await expect.poll(() => landed.length).toBe(run + 1);
  }
  console.log(`[budget] guest blank ms=${times.join(',')}`);
  expect(median(times)).toBeLessThanOrEqual(NEW_DOCUMENT_OPEN_BUDGET_MS);
  expectNoPageErrors(pageErrors);
});

test('a template opens editable within its budget, and is there after a reload', async ({
  page,
  pageErrors,
}) => {
  const times: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    await openExplorer(page);
    times.push(await openKanban(page));
  }
  console.log(`[budget] guest template ms=${times.join(',')}`);
  expect(median(times)).toBeLessThanOrEqual(NEW_DOCUMENT_TEMPLATE_BUDGET_MS);
  // Made where a guest's documents go: a reload opens it from This Browser.
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.locator('[data-canvas-a11y-root]')).toBeAttached({ timeout: 15_000 });
  expectNoPageErrors(pageErrors);
});
