import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInlineScript } from '@livedoc/vitest-config/inline-script';
import Page from './page';
import { requestSummary, SUMMARY_BOOT_SCRIPT, SUMMARY_URL } from './summary-request';

// docs/specs/016-platform/web-performance.md "Delivery": the dashboard's summary leaves with its HTML, from an inline
// script, and the page's code takes that request rather than asking a second time.
type EarlyWindow = { __livedocTelemetrySummary?: Promise<Response> };

function runBootScript(win: EarlyWindow, fetchImpl: (url: string) => Promise<Response>) {
  runInlineScript(SUMMARY_BOOT_SCRIPT, { window: win, fetch: fetchImpl });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the summary boot script', () => {
  it('asks for the summary as soon as it runs', () => {
    const win: EarlyWindow = {};
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
    runBootScript(win, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(SUMMARY_URL);
    expect(win.__livedocTelemetrySummary).toBeInstanceOf(Promise);
  });

  it('leaves the page to ask itself where fetch throws', () => {
    const win: EarlyWindow = {};
    runBootScript(win, () => {
      throw new Error('no fetch');
    });
    expect(win.__livedocTelemetrySummary).toBeUndefined();
  });
});

describe('requestSummary', () => {
  it('takes the request the boot script made, once', async () => {
    const early = new Response('{}');
    const fetchImpl = vi.fn(async () => new Response('{"late":true}'));
    vi.stubGlobal('fetch', fetchImpl);
    vi.stubGlobal('window', { __livedocTelemetrySummary: Promise.resolve(early) });
    expect(await requestSummary()).toBe(early);
    expect(fetchImpl).not.toHaveBeenCalled();
    await requestSummary();
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(SUMMARY_URL);
  });

  it('asks itself where the boot script did not run', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchImpl);
    vi.stubGlobal('window', {});
    await requestSummary();
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(SUMMARY_URL);
  });
});

describe('the dashboard page', () => {
  it('starts the summary before any of its own markup', () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    const html = renderToStaticMarkup(<Page />);
    expect(html.startsWith('<script>')).toBe(true);
    expect(html).toContain(SUMMARY_URL);
  });
});
