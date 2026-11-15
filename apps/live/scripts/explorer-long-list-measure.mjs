// Measures the Explorer's long lists in Chromium at 4x CPU slowdown (docs/specs/016-platform/web-performance.md
// "Long lists"): opening a folder of many documents, scrolling it top to bottom, finding a row far down, and Back.
// Every main-thread task over 50 ms is counted (the Long Tasks API). Dark mode, as every capture is.
// Usage: node explorer-long-list-measure.mjs <base-url> <seed.json> [list|card|details] [--shots <dir>]
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [base = 'http://localhost:3522', seedPath = '/tmp/lei-seed.json', view = 'list'] =
  process.argv.slice(2);
const shotsAt = process.argv.indexOf('--shots');
const shots = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
const farName = seed.names[seed.count - 7];

const browser = await chromium.launch({ args: ['--mute-audio'] });
const context = await browser.newContext({
  colorScheme: 'dark',
  viewport: { width: 1440, height: 900 },
});
await context.addInitScript(
  ({ ownerId, ownerSig, view }) => {
    localStorage.setItem('livedoc:v2:ui-mode', 'dark');
    localStorage.setItem('livedoc:v2:name-confirmed', '1');
    localStorage.setItem('livedoc:v2:self-id', ownerId);
    if (ownerSig) localStorage.setItem('livedoc:v2:self-sig', ownerSig);
    localStorage.setItem('livedoc:explorer-view', view);
    window.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__longTasks.push(Math.round(e.duration));
    }).observe({ type: 'longtask', buffered: true });
  },
  { ownerId: seed.ownerId, ownerSig: seed.ownerSig, view },
);
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

const results = [];
async function step(name, run) {
  await page.evaluate(() => (window.__longTasks = []));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const started = Date.now();
  const note = await run();
  const ms = Date.now() - started;
  await page.waitForTimeout(1500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const tasks = await page.evaluate(() => window.__longTasks);
  results.push({
    step: name,
    ms,
    longTasks: tasks.length,
    longest: Math.max(0, ...tasks),
    note: note ?? '',
  });
  console.log(JSON.stringify({ ...results.at(-1), tasks: tasks.slice(0, 30) }));
  if (shots) await page.screenshot({ path: `${shots}/${view}-${name.replace(/\W+/g, '-')}.png` });
}

const row = (name) => page.getByText(name, { exact: true }).first();

// The editor's Explorer panel: a document open, the panel on My Documents, its Archive card the folder to open.
const inPanel = view === 'panel';
const folder = () =>
  inPanel
    ? page.getByRole('button', { name: /^Archive/ }).first()
    : page.getByRole('treeitem', { name: 'Archive' });
if (inPanel) {
  await page.goto(`${base}/explorer/all`);
  await page.getByRole('treeitem', { name: 'Archive' }).click();
  await row(seed.names[0]).click();
  await page.waitForURL(/\/document\//);
  await page.getByRole('button', { name: 'Explorer', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Explorer sections' })
    .getByRole('button', { name: /My Documents/ })
    .click();
} else {
  await page.goto(`${base}/explorer/all`);
}
await folder().waitFor();
await page.waitForTimeout(2000);
const domBefore = await page.evaluate(() => document.getElementsByTagName('*').length);

await step('open the folder', async () => {
  await folder().click();
  await row(seed.names[1]).waitFor();
  return `${(await page.evaluate(() => document.getElementsByTagName('*').length)) - domBefore} elements added`;
});

await step('scroll top to bottom', async () => {
  let previous = -1;
  for (;;) {
    const y = await page.evaluate((inPanel) => {
      // The panel's pane scrolls in its own box; the Explorer page scrolls the window.
      const box = inPanel ? document.querySelector('[data-explorer-pane]') : null;
      if (!box) {
        window.scrollBy(0, 700);
        return window.scrollY;
      }
      box.scrollBy(0, 400);
      return box.scrollTop;
    }, inPanel);
    await page.waitForTimeout(120);
    if (y === previous) break;
    previous = y;
  }
  const last = await row(seed.names[seed.count - 1]).isVisible();
  return `last row ${last ? 'reached' : 'NOT reached'}`;
});

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);
if (inPanel) {
  console.table(results);
  await browser.close();
  process.exit(0);
}

await step('find a row far down', async () => {
  await page.keyboard.press('Control+f');
  const field = page.getByPlaceholder('Search or filter documents');
  const ctrlF = await field.evaluate((el) => el === document.activeElement).catch(() => false);
  if (!ctrlF) await field.click();
  await page.keyboard.type(farName, { delay: 40 });
  await row(farName).waitFor();
  return `found ${farName}${ctrlF ? ' (Ctrl F focused the field)' : ' (Ctrl F did not reach the field; clicked it)'}`;
});

await step('open it and go back', async () => {
  const target = row(farName);
  await target.scrollIntoViewIfNeeded().catch(() => {});
  const yBefore = await page.evaluate(() => window.scrollY);
  await target.click();
  await page.waitForURL(/\/document\//);
  await page.waitForTimeout(1500);
  await page.goBack();
  await row(farName)
    .waitFor({ timeout: 10_000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  const inView = await row(farName)
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight;
    })
    .catch(() => false);
  return `scrollY before ${yBefore}, after ${await page.evaluate(() => window.scrollY)}; row in view after Back: ${inView}`;
});

console.table(results);
await browser.close();
