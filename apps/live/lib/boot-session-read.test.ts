// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { URL as NodeUrl, fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInlineScript } from '@livedoc/vitest-config/inline-script';
import {
  SESSION_READ_BOOT_SCRIPT,
  SESSION_READ_URL,
  resetBootSessionReadForTests,
  sessionReadFetch,
} from './boot-session-read';

// docs/specs/016-platform/web-performance.md "The open path asks in parallel": the session read leaves with the HTML.

const LAYOUT = readFileSync(
  fileURLToPath(new NodeUrl('../app/layout.tsx', import.meta.url)),
  'utf8',
);

type Asked = { url: string; init: RequestInit };

function boot(pathname: string, fetchImpl?: (url: string, init: RequestInit) => unknown) {
  const asked: Asked[] = [];
  const window: Record<string, unknown> = {};
  runInlineScript(SESSION_READ_BOOT_SCRIPT, {
    window,
    location: { pathname },
    fetch: (url: string, init: RequestInit) => {
      asked.push({ url, init });
      return fetchImpl ? fetchImpl(url, init) : Promise.resolve(new Response('null'));
    },
  });
  return { asked, window };
}

afterEach(() => {
  resetBootSessionReadForTests();
  vi.unstubAllGlobals();
});

describe('the session read boot script', () => {
  it('is inlined at the top of every page of the editor app', () => {
    const head = LAYOUT.slice(LAYOUT.indexOf('<head>'), LAYOUT.indexOf('</head>'));
    expect(head).toContain('__html: trustedHtml(SESSION_READ_BOOT_SCRIPT)');
  });

  it('asks for the session as the auth bridge would', () => {
    const { asked } = boot('/document/abc');
    expect(asked).toEqual([
      { url: SESSION_READ_URL, init: { cache: 'no-store', credentials: 'same-origin' } },
    ]);
  });

  it('asks nothing where the auth bridge stands down', () => {
    expect(boot('/embed/workbench').asked).toEqual([]);
    expect(boot('/embed/workbench/abc').asked).toEqual([]);
  });

  it('never throws, nor leaves a failed read unhandled', async () => {
    expect(() =>
      boot('/new', () => {
        throw new Error('blocked');
      }),
    ).not.toThrow();
    const failed = Promise.reject(new TypeError('Failed to fetch'));
    const { window } = boot('/new', () => failed);
    expect(window.__livedocSessionRead).toBe(failed);
    await expect(failed).rejects.toThrow('Failed to fetch');
  });
});

describe('sessionReadFetch', () => {
  it('takes the boot read once, then asks itself', async () => {
    const early = new Response('{"early":true}');
    vi.stubGlobal('__livedocSessionRead', Promise.resolve(early));
    const own = vi.fn(async () => new Response('{"own":true}'));
    vi.stubGlobal('fetch', own);
    const init: RequestInit = { cache: 'no-store', credentials: 'same-origin' };
    expect(await sessionReadFetch(SESSION_READ_URL, init)).toBe(early);
    expect(own).not.toHaveBeenCalled();
    await sessionReadFetch(SESSION_READ_URL, init);
    expect(own).toHaveBeenCalledWith(SESSION_READ_URL, init);
  });

  it('asks itself when the page started without the boot read', async () => {
    const own = vi.fn(async () => new Response('null'));
    vi.stubGlobal('fetch', own);
    await sessionReadFetch(SESSION_READ_URL, {});
    expect(own).toHaveBeenCalledOnce();
  });

  it('never hands the boot read to another address', async () => {
    vi.stubGlobal('__livedocSessionRead', Promise.resolve(new Response('null')));
    const own = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', own);
    await sessionReadFetch('/api/auth/token', {});
    expect(own).toHaveBeenCalledWith('/api/auth/token', {});
  });
});
