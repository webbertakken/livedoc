import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';

// A form's responses into a spreadsheet (plan 0020 Phase 14 box 1; docs/specs/029-sheets/plan-links.md "Form
// responses", D506): an Editor's Rows in a Sheet makes a spreadsheet "<Form> Responses" and connects the form; a
// response lands there as a row; the sheet wears the form mark, and Unlink Form pauses the form.

test.use({ colorScheme: 'dark', launchOptions: { args: ['--mute-audio'] } });

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

type LinkRead = {
  name: string;
  sheets: { id: string; title: string }[];
  sheet: { cells: { v?: unknown }[] } | null;
};

test('a form sends its responses to a new spreadsheet, until Unlink Form', async ({
  page,
  baseURL,
  pageErrors,
}, testInfo) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  // The editor gives this browser its owner id (and its signature) on its first open.
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('livedoc:v2:self-id') ?? ''))
    .not.toBe('');
  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });

  // A Plan document with a Form tab that sends its responses nowhere yet.
  const docId = `form-${Date.now()}`;
  const tabId = `${docId}-f`;
  const created = await page.request.post(`${apiBase}/documents`, {
    headers,
    data: {
      id: docId,
      name: 'Team',
      tabs: [
        {
          id: tabId,
          name: 'Feedback',
          kind: 'form',
          opensIn: 'plan',
          elements: [],
          form: {
            v: 1,
            heading: 'Feedback',
            sections: [
              {
                id: 's-1',
                title: '',
                questions: [
                  { id: 'q-say', type: 'short', prompt: 'What went well?', required: true },
                ],
              },
            ],
          },
        },
      ],
    },
  });
  expect(created.status(), await created.text()).toBeLessThan(300);
  await page.goto(`/document/${docId}`);

  // Rows in a Sheet: a new spreadsheet, connected, named back in the status bar.
  const box = page.getByRole('region', { name: 'Where Should Responses Go?' });
  await expect(box).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('connect-box.png'), animations: 'disabled' });
  await box.getByRole('button', { name: /Rows in a Sheet/ }).click();
  await expect(box).toBeHidden({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Form Settings' }).first().click();
  const goesTo = page.getByRole('tabpanel', { name: 'Responses Go To' });
  await expect(goesTo).toContainText(
    'Each response becomes a row on Form Responses 1 · Feedback Responses',
    { timeout: 20_000 },
  );
  await page.screenshot({
    path: testInfo.outputPath('responses-go-to.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');

  // The spreadsheet the form names, once the form's tab is saved.
  type Stored = { tab?: { form?: { sheet?: { documentId: string; sheetId: string } } } };
  let sheet: { documentId: string; sheetId: string } | undefined;
  await expect
    .poll(async () => {
      const res = await page.request.get(`${apiBase}/documents/${docId}/tabs/${tabId}`, {
        headers,
      });
      sheet = ((await res.json()) as Stored).tab?.form?.sheet;
      return sheet?.documentId ?? '';
    })
    .not.toBe('');
  const linkOf = async () => {
    const res = await page.request.get(
      `${apiBase}/documents/${sheet!.documentId}/workbook/link?sheet=${sheet!.sheetId}`,
      { headers },
    );
    expect(res.status()).toBe(200);
    return (await res.json()) as LinkRead;
  };
  expect((await linkOf()).name).toBe('Feedback Responses');

  // Published, a response lands as a row of the spreadsheet's sheet.
  const published = await page.request.post(
    `${apiBase}/documents/${docId}/tabs/${tabId}/form-link`,
    { headers },
  );
  expect(published.status()).toBe(200);
  const code = ((await published.json()) as { link: { code: string } }).link.code;
  const answered = await page.request.post(`${apiBase}/forms/${code}/responses`, {
    data: { answers: { 'q-say': 'The demo' } },
  });
  expect(answered.status()).toBe(201);
  await expect
    .poll(async () => JSON.stringify((await linkOf()).sheet?.cells ?? []))
    .toContain('The demo');

  // In the spreadsheet: the form mark, and Unlink Form pauses the form.
  await page.goto(`/document/${sheet!.documentId}`);
  const marked = page.getByRole('tab', { name: 'Form Responses 1, takes responses from a form' });
  await expect(marked).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /^Form Responses 1.* menu$/ }).click();
  await expect(page.getByText('Unlink Form')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('unlink-form.png'), animations: 'disabled' });
  await page.getByText('Unlink Form').click();
  await page.getByRole('button', { name: 'Unlink' }).click();
  await expect(page.getByRole('tab', { name: 'Form Responses 1' })).toBeVisible();
  const refused = await page.request.post(`${apiBase}/forms/${code}/responses`, {
    data: { answers: { 'q-say': 'Too late' } },
  });
  expect(refused.status()).toBe(409);

  expectNoPageErrors(pageErrors);
});
