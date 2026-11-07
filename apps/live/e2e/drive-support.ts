// Support for the Google Drive mirror e2e (docs/specs/022-drive-mirror/drive-mirror.md,
// "Testing"): the fake Google served over HTTP for the worker's OAuth calls, and the browser's Google
// traffic routed into the same fake. Accounts sign in for real (account/sign-in.ts).

import type { Server } from 'node:http';
import type { Page, Route } from '@playwright/test';
import { FakeGoogle } from '@livedoc/fake-google';
import { serveFakeGoogle } from '@livedoc/fake-google/server';

// The same default scripts/e2e-stack.mjs gives the api worker.
const GOOGLE_PORT = Number(process.env.E2E_DRIVE_GOOGLE_PORT ?? 8796);

export async function startFakeGoogle(): Promise<{ fake: FakeGoogle; server: Server }> {
  const fake = new FakeGoogle();
  return { fake, server: await serveFakeGoogle(fake, GOOGLE_PORT) };
}

async function fulfilFromFake(fake: FakeGoogle, route: Route): Promise<void> {
  const req = route.request();
  const body = req.postDataBuffer();
  const response = await fake.handle(
    new Request(req.url(), {
      method: req.method(),
      headers: req.headers(),
      body: body && req.method() !== 'GET' ? new Uint8Array(body) : undefined,
    }),
  );
  await route.fulfill({
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: Buffer.from(await response.arrayBuffer()),
  });
}

// A fake Google Picker: picks whatever folder the test names in
// `window.__e2ePickFolder`, straight away.
const FAKE_PICKER = `
window.gapi = { load: (_lib, cb) => cb() };
window.google = window.google || {};
window.google.picker = {
  ViewId: { FOLDERS: 'folders' },
  Action: { PICKED: 'picked', CANCEL: 'cancel' },
  DocsView: class { setSelectFolderEnabled() { return this; } setIncludeFolders() { return this; } setMimeTypes() { return this; } setParent() { return this; } },
  PickerBuilder: class {
    addView() { return this; } setOAuthToken() { return this; } setDeveloperKey() { return this; }
    setAppId() { return this; } setTitle() { return this; }
    setCallback(cb) { this.cb = cb; return this; }
    build() { const cb = this.cb; return { setVisible: () => setTimeout(() => cb({ action: 'picked', docs: [{ id: window.__e2ePickFolder }] }), 0) }; }
  },
};`;

// Every Google request the browser makes, answered by the fake: the Drive
// REST API, the consent screen (the user agrees at once), and the Picker.
export async function routeGoogle(page: Page, fake: FakeGoogle, user: string): Promise<void> {
  // Hermetic: the page's Google Fonts stylesheet would otherwise hold the load
  // event on the real network (a slow or failing DNS lookup timed a goto out).
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.route('https://www.googleapis.com/**', (route) => fulfilFromFake(fake, route));
  await page.route('https://accounts.google.com/o/oauth2/v2/auth**', async (route) => {
    const url = new URL(route.request().url());
    const back = new URL(url.searchParams.get('redirect_uri')!);
    back.searchParams.set('code', fake.consent(user));
    back.searchParams.set('state', url.searchParams.get('state')!);
    await route.fulfill({ status: 302, headers: { Location: back.toString() } });
  });
  await page.route('https://apis.google.com/js/api.js', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_PICKER }),
  );
}
