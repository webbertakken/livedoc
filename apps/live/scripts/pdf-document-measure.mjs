// Measures a PDF document's surface in Chromium (docs/specs/035-pdf-documents/reading-surface.md "Budgets";
// docs/specs/016-platform/web-performance.md "Measuring"): a PDF dropped on the Explorer, then opened cold (a new
// browser, nothing cached) and warm (a reload), scrolled through, and jumped to its end. For each: when the surface
// was ready and page one drawn, what the engine weighed on the wire, every main-thread task over 50 ms, the frames,
// how often the middle of the view showed a page not yet drawn, and the memory of the page's process. Dark mode, as
// every capture is.
// Usage: node pdf-document-measure.mjs <base-url> <file.pdf>... [--cpu <rate>] [--json <out.json>] [--shots <dir>]
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args.splice(at, 2)[1] : null;
};
const cpuRate = Number(option('--cpu') ?? 1);
const jsonOut = option('--json');
const shots = option('--shots');
const [base = 'http://localhost:3462', ...files] = args;
if (files.length === 0) throw new Error('Name at least one PDF.');

const VIEWPORT = { width: 1440, height: 900 };
const READY = '[data-pdf-surface="ready"]';
const SCROLLER = '[data-pdf-pages]';
// How far and how often the scroll step moves at a reading pace: a brisk wheel, a viewport every half second.
const SCROLL_STEP_PX = 180;
// A fast scroll: about six viewports a second.
const SCROLL_FAST_STEP_PX = 600;
const SCROLL_STEP_MS = 100;
const SCROLL_STEPS = 80;
const OPEN_TIMEOUT_MS = 180_000;

/** Runs in the page before anything else: the marks this script reads back. */
function watchPage() {
  localStorage.setItem('livedoc:v2:ui-mode', 'dark');
  localStorage.setItem('livedoc:v2:name-confirmed', '1');
  localStorage.setItem('livedoc:debug', 'pdf');
  const seen = { ready: null, firstPage: null, longTasks: [], lcp: null, cls: 0 };
  window.__pdf = seen;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) seen.longTasks.push(Math.round(entry.duration));
  }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) seen.lcp = Math.round(entry.startTime);
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) seen.cls += entry.value;
  }).observe({ type: 'layout-shift', buffered: true });
  const look = () => {
    if (seen.ready === null && document.querySelector('[data-pdf-surface="ready"]'))
      seen.ready = Math.round(performance.now());
    if (
      seen.firstPage === null &&
      document.querySelector('[data-pdf-page="1"][data-pdf-page-drawn="true"]')
    )
      seen.firstPage = Math.round(performance.now());
  };
  new MutationObserver(look).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-pdf-surface', 'data-pdf-page-drawn'],
  });
}

/** Runs in the page: frames, and whether the page under the middle of the view is drawn, until stopped. */
function watchFrames() {
  const frames = { gaps: [], undrawn: 0, total: 0, stop: false };
  window.__frames = frames;
  const scroller = document.querySelector('[data-pdf-pages]');
  const box = scroller.getBoundingClientRect();
  let last = performance.now();
  const tick = (now) => {
    frames.gaps.push(now - last);
    last = now;
    const under = document
      .elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      ?.closest('[data-pdf-page]');
    frames.total += 1;
    if (under && under.getAttribute('data-pdf-page-drawn') !== 'true') frames.undrawn += 1;
    if (!frames.stop) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]);
};
const mib = (bytes) => Math.round((bytes / 1_048_576) * 10) / 10;

/** The resident memory of the browser's largest renderer process: the page and its engine worker. */
async function rendererMemory(browser) {
  const session = await browser.newBrowserCDPSession();
  const { processInfo } = await session.send('SystemInfo.getProcessInfo');
  await session.detach();
  let most = 0;
  for (const info of processInfo) {
    if (info.type !== 'renderer') continue;
    try {
      const status = readFileSync(`/proc/${info.id}/status`, 'utf8');
      const rss = Number(/VmRSS:\s+(\d+) kB/.exec(status)?.[1] ?? 0) * 1024;
      most = Math.max(most, rss);
    } catch {
      // The process ended between the two reads.
    }
  }
  return most;
}

async function newContext(browser, storageState) {
  const context = await browser.newContext({
    colorScheme: 'dark',
    viewport: VIEWPORT,
    ...(storageState ? { storageState } : {}),
  });
  await context.addInitScript(watchPage);
  return context;
}

/** What the open of the document at `url` came to, on a page that has just navigated there. */
async function readOpen(page, browser, logs) {
  await page.waitForSelector(READY, { timeout: OPEN_TIMEOUT_MS });
  await page.waitForSelector('[data-pdf-page="1"][data-pdf-page-drawn="true"]', {
    timeout: OPEN_TIMEOUT_MS,
  });
  // The paint after the picture, and the engine's last answers.
  await page.waitForTimeout(500);
  const seen = await page.evaluate(() => window.__pdf);
  const engine = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((entry) => /pdfium.*\.wasm|pdf-engine|PdfDocumentSurface/.test(entry.name))
      .map((entry) => ({
        name: entry.name.split('/').pop(),
        transfer: entry.transferSize,
        decoded: entry.decodedBodySize,
        ms: Math.round(entry.duration),
      })),
  );
  const opened = logs.findLast((line) => line.includes('[pdf] opened')) ?? null;
  const pictures = await page.evaluate(() =>
    [...document.querySelectorAll('[data-pdf-page] canvas')].reduce(
      (sum, canvas) => sum + canvas.width * canvas.height * 4,
      0,
    ),
  );
  return {
    readyMs: seen.ready,
    firstPageMs: seen.firstPage,
    lcpMs: seen.lcp,
    cls: Math.round(seen.cls * 1000) / 1000,
    longTasks: seen.longTasks,
    opened,
    engine,
    picturesMiB: mib(pictures),
    memoryMiB: mib(await rendererMemory(browser)),
  };
}

async function measure(file) {
  const name = basename(file);
  const bytes = statSync(file).size;
  const result = { file: name, bytes, cpuRate };

  // 1. Dropped on the Explorer: hashed, sent, made a document, opened.
  const first = await chromium.launch({ args: ['--mute-audio'] });
  const context = await newContext(first, null);
  const page = await context.newPage();
  const logs = [];
  page.on('console', (message) => logs.push(message.text()));
  await page.goto(`${base}/explorer/all`);
  await page.getByRole('heading', { name: 'My Documents' }).first().waitFor();
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'measure-file';
    input.style.display = 'none';
    document.body.append(input);
  });
  await page.locator('#measure-file').setInputFiles(file);
  const transfer = await page.evaluateHandle(() => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(document.querySelector('#measure-file').files[0]);
    return dataTransfer;
  });
  const dropped = Date.now();
  await page.dispatchEvent('body', 'dragover', { dataTransfer: transfer });
  await page.dispatchEvent('body', 'drop', { dataTransfer: transfer });
  await page.waitForURL(/\/document\//, { timeout: OPEN_TIMEOUT_MS });
  result.storedMs = Date.now() - dropped;
  await page.waitForSelector('[data-pdf-page="1"][data-pdf-page-drawn="true"]', {
    timeout: OPEN_TIMEOUT_MS,
  });
  result.dropToFirstPageMs = Date.now() - dropped;
  result.pages = Number(await page.locator(SCROLLER).getAttribute('data-pdf-pages'));
  const url = page.url();
  const storageState = await context.storageState();
  await first.close();

  // 2. Opened cold: a new browser, nothing cached.
  const browser = await chromium.launch({ args: ['--mute-audio'] });
  const cold = await newContext(browser, storageState);
  const reader = await cold.newPage();
  const cdp = await cold.newCDPSession(reader);
  if (cpuRate !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  const readerLogs = [];
  reader.on('console', (message) => readerLogs.push(message.text()));
  await reader.goto(url);
  result.cold = await readOpen(reader, browser, readerLogs);
  if (shots) await reader.screenshot({ path: `${shots}/${name}-cold.png` });

  // 3. Opened warm: a reload, the scripts and the engine in the browser's cache.
  readerLogs.length = 0;
  await reader.reload();
  result.warm = await readOpen(reader, browser, readerLogs);

  // 4. Scrolled through with the wheel: at a reading pace, then fast.
  const box = await reader.locator(SCROLLER).boundingBox();
  await reader.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const scroll = async (stepPx) => {
    await reader.evaluate(() => (window.__pdf.longTasks = []));
    await reader.evaluate(watchFrames);
    let peak = 0;
    for (let step = 0; step < SCROLL_STEPS; step += 1) {
      await reader.mouse.wheel(0, stepPx);
      await reader.waitForTimeout(SCROLL_STEP_MS);
      if (step % 10 === 9) peak = Math.max(peak, await rendererMemory(browser));
    }
    // Stopped: how long until the page under the middle of the view is drawn.
    const stopped = Date.now();
    await reader.waitForFunction(
      () => {
        const scroller = document.querySelector('[data-pdf-pages]').getBoundingClientRect();
        const under = document
          .elementFromPoint(scroller.left + scroller.width / 2, scroller.top + scroller.height / 2)
          ?.closest('[data-pdf-page]');
        return !under || under.getAttribute('data-pdf-page-drawn') === 'true';
      },
      null,
      { timeout: OPEN_TIMEOUT_MS, polling: 'raf' },
    );
    const settledMs = Date.now() - stopped;
    const seen = await reader.evaluate(() => {
      window.__frames.stop = true;
      return { frames: window.__frames, longTasks: window.__pdf.longTasks };
    });
    await reader.waitForTimeout(100);
    return {
      pxPerSecond: Math.round((stepPx * 1000) / SCROLL_STEP_MS),
      px: SCROLL_STEPS * stepPx,
      frames: seen.frames.total,
      frameP50Ms: percentile(seen.frames.gaps, 50),
      frameP95Ms: percentile(seen.frames.gaps, 95),
      frameMaxMs: percentile(seen.frames.gaps, 100),
      framesOver50Ms: seen.frames.gaps.filter((gap) => gap > 50).length,
      undrawnShare: Math.round((seen.frames.undrawn / seen.frames.total) * 1000) / 1000,
      settledMs,
      longTasks: seen.longTasks,
      peakMemoryMiB: mib(peak),
    };
  };
  result.scroll = await scroll(SCROLL_STEP_PX);
  result.fastScroll = await scroll(SCROLL_FAST_STEP_PX);

  // 5. Jumped to the end: how long until the last page shows.
  await reader.evaluate(() => (window.__pdf.longTasks = []));
  const jumped = Date.now();
  await reader.evaluate(() => {
    const scroller = document.querySelector('[data-pdf-pages]');
    scroller.scrollTop = scroller.scrollHeight;
  });
  await reader.waitForSelector(`[data-pdf-page="${result.pages}"][data-pdf-page-drawn="true"]`, {
    timeout: OPEN_TIMEOUT_MS,
  });
  result.jumpToEnd = {
    lastPageMs: Date.now() - jumped,
    longTasks: await reader.evaluate(() => window.__pdf.longTasks),
    memoryMiB: mib(await rendererMemory(browser)),
    drawnPages: await reader.locator('[data-pdf-page-drawn="true"]').count(),
    picturesMiB: mib(
      await reader.evaluate(() =>
        [...document.querySelectorAll('[data-pdf-page] canvas')].reduce(
          (sum, canvas) => sum + canvas.width * canvas.height * 4,
          0,
        ),
      ),
    ),
  };
  if (shots) await reader.screenshot({ path: `${shots}/${name}-end.png` });
  await browser.close();
  return result;
}

const results = [];
for (const file of files) {
  const result = await measure(file);
  results.push(result);
  console.log(JSON.stringify(result));
}
if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(results, null, 2)}\n`);
