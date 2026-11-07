import { expect, test } from '../fixtures';
import { signIn } from './sign-in';

// The device sign-in page (docs/specs/015-api/cli.md): a person
// signed in enters the code their terminal shows, sees which client asks, and approves; the page mints a token
// through the api and hands it to the MCP worker. The stack runs no MCP worker, so its three routes are answered
// here, as it would answer them.

test.use({ colorScheme: 'dark', viewport: { width: 1280, height: 800 } });

const MCP = 'https://mcp.docs.nu';

test('a signed-in person connects the CLI with the code their terminal shows', async ({
  page,
  context,
  baseURL,
  pageErrors,
}) => {
  await signIn(context, { baseURL: baseURL!, name: 'Webber Takken' });
  const completed: unknown[] = [];
  await page.route(`${MCP}/oauth/device/session/*`, (route) =>
    route.request().url().endsWith('/BCDF-GHJK')
      ? route.fulfill({ json: { clientName: 'LiveDoc CLI' } })
      : route.fulfill({ status: 404, json: { error: 'invalid_code' } }),
  );
  await page.route(`${MCP}/oauth/device/complete`, async (route) => {
    completed.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto('/oauth/device?code=bcdf-zzzz');
  await expect(page.getByRole('heading', { name: 'Connect a terminal' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'We couldn’t find that code yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();

  await page.getByLabel('Code shown in your terminal').fill('bcdf ghjk');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Connect LiveDoc CLI' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('oauth-device-consent.png') });

  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'You’re connected' })).toBeVisible();
  expect(completed).toEqual([
    {
      userCode: 'BCDF-GHJK',
      token: expect.stringMatching(/^livedoc_/),
      expiresAt: expect.any(Number),
    },
  ]);
  expect(pageErrors).toEqual([]);
});

test('cancelling refuses the code, so the terminal stops waiting', async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, { baseURL: baseURL!, name: 'Webber Takken' });
  const denied: unknown[] = [];
  await page.route(`${MCP}/oauth/device/session/*`, (route) =>
    route.fulfill({ json: { clientName: 'LiveDoc CLI' } }),
  );
  await page.route(`${MCP}/oauth/device/deny`, async (route) => {
    denied.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/oauth/device?code=BCDF-GHJK');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Connection cancelled' })).toBeVisible();
  expect(denied).toEqual([{ userCode: 'BCDF-GHJK' }]);
});
