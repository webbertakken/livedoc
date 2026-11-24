import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--mute-audio'] });
const ctx = await b.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
  reducedMotion: 'reduce',
});
const p = await ctx.newPage();
const vis = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('[role^=menuitem],[role=option],[role=dialog] button')]
      .filter((e) => e.getBoundingClientRect().height > 0)
      .map((e) => (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 30))
      .join(' | '),
  );
await p.goto('https://docs.nu/explorer/home', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
await p.getByRole('button', { name: 'New Diagram' }).first().click();
await p.waitForTimeout(5000);
await p.getByRole('button', { name: 'Add tab' }).click();
await p.waitForTimeout(1500);
console.log('ADD', await vis());
await p.goto('https://docs.nu/new?kind=spreadsheet', { waitUntil: 'networkidle' });
await p.waitForTimeout(6000);
console.log('URL', p.url());
console.log(
  'SHEET',
  await p.evaluate(() =>
    [...document.querySelectorAll('button,[role=tab]')]
      .filter((e) => e.getBoundingClientRect().height > 0)
      .map((e) => (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 20))
      .join(' | '),
  ),
);
await b.close();
