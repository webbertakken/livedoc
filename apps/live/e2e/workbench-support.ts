// Support for the workbench embed e2e (docs/specs/013-workspace/workbench-embeds.md,
// "Testing"): the fake workbench served from its own loopback origin, the person signed in for real on the
// signed-in stack (account/sign-in.ts), and the api calls the CLI would make.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { signIn } from './account/sign-in';

const FAKE_WORKBENCH_HTML = readFileSync(
  new URL('./fixtures/fake-workbench.html', import.meta.url),
  'utf8',
);

export type FakeWorkbench = {
  origin: string;
  // Opens the fake workbench in `page` and hands it `frameUrl` to frame.
  open: (page: Page, frameUrl: string, opts?: { silent?: boolean }) => Promise<void>;
  close: () => Promise<void>;
};

// Serves the fake workbench on 127.0.0.1 at a free port: another origin than the live app's localhost.
export async function serveFakeWorkbench(): Promise<FakeWorkbench> {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(FAKE_WORKBENCH_HTML);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    open: async (page, frameUrl, opts = {}) => {
      await page.goto(`${origin}/${opts.silent ? '?silent=1' : ''}`);
      const framed = await page.evaluate(
        (url) => (window as unknown as { openFrame: (u: string) => boolean }).openFrame(url),
        frameUrl,
      );
      if (!framed) throw new Error(`the fake workbench refused to frame ${frameUrl}`);
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export type Person = { userId: string; jwt: string; name: string };

// A person signed in to `context` (every page it opens on the live origin is theirs), with a session token for the
// api calls the CLI would make as them.
export async function newPerson(
  context: BrowserContext,
  baseURL: string,
  name: string,
): Promise<Person> {
  const account = await signIn(context, { baseURL, name });
  return { userId: account.id, jwt: await account.sessionToken(), name };
}

async function call(
  request: APIRequestContext,
  method: string,
  path: string,
  bearer: string,
  body?: unknown,
) {
  return request.fetch(`/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
  });
}

export async function apiJson<T>(
  request: APIRequestContext,
  method: string,
  path: string,
  bearer: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const res = await call(request, method, path, bearer, body);
  const text = await res.text();
  return { status: res.status(), body: (text ? JSON.parse(text) : null) as T };
}

export type Seeded = { documentId: string; tabId: string; token: string };

// A document of the person's with one labelled square, and an API token, as the CLI holds.
export async function seedDocumentAndToken(
  request: APIRequestContext,
  person: Person,
): Promise<Seeded> {
  const documentId = `wb-doc-${randomUUID()}`;
  const tabId = `wb-tab-${randomUUID()}`;
  const created = await apiJson(request, 'POST', '/documents', person.jwt, {
    id: documentId,
    name: 'Home screen',
    tabs: [
      {
        id: tabId,
        name: 'Wireframe',
        elements: [
          {
            id: 'el-play',
            type: 'shape',
            shape: 'square',
            x: 200,
            y: 200,
            width: 140,
            height: 80,
            label: 'Play',
          },
        ],
      },
    ],
  });
  if (created.status >= 300) throw new Error(`creating the document failed: ${created.status}`);
  const token = await apiJson<{ token: string }>(request, 'POST', '/tokens', person.jwt, {
    name: 'LiveDoc CLI',
  });
  if (token.status >= 300) throw new Error(`creating the token failed: ${token.status}`);
  return { documentId, tabId, token: token.body.token };
}

// `livedoc workbench open`: POST /api/workbench/tickets with the token.
export function mintTicket(
  request: APIRequestContext,
  seeded: Seeded,
  origin: string,
): Promise<{ status: number; body: { url?: string; pairingUrl?: string } }> {
  return apiJson(request, 'POST', '/workbench/tickets', seeded.token, {
    documentId: seeded.documentId,
    origin,
  });
}

export function ticketOf(url: string): string {
  return new URL(url).hash.replace('#ticket=', '');
}

// The fake workbench's record of what the frame sent.
export function received(page: Page): Promise<{ type: string; [k: string]: unknown }[]> {
  return page.evaluate(() => (window as unknown as { received: never[] }).received);
}

// `livedoc workbench open --workspace [--folder <f>]`: a workspace ticket, on Home or a folder.
export function mintWorkspaceTicket(
  request: APIRequestContext,
  seeded: Seeded,
  origin: string,
  folderId?: string,
): Promise<{
  status: number;
  body: { url?: string; pairingUrl?: string; folderId?: string | null };
}> {
  return apiJson(request, 'POST', '/workbench/tickets', seeded.token, {
    scope: 'workspace',
    ...(folderId ? { folderId } : {}),
    origin,
  });
}

// A folder of the person's, at the top of My Documents, as `livedoc folder create` makes it.
export async function createFolder(
  request: APIRequestContext,
  person: Person,
  name: string,
): Promise<string> {
  const id = `wb-folder-${randomUUID()}`;
  const made = await apiJson(request, 'POST', '/folders', person.jwt, { id, name, parentId: null });
  if (made.status >= 300) throw new Error(`creating the folder failed: ${made.status}`);
  return id;
}
