import { chromium } from '@playwright/test';
const [label, base, only] = process.argv.slice(2);
const out = '/home/webber/Repositories/livedoc/plans/assets/0024';
const b = await chromium.launch({ args: ['--mute-audio'] });
const VP = { desktop: { viewport: { width: 1440, height: 900 } }, phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } };
const CARDS = ['Add Title', 'Add Sticky Note', 'Add Status', 'Add Checklist', 'Add Key Date', 'Add Links'];
const measure = () => [...document.querySelectorAll('h2,h3,input,textarea,p,span,button,a')].filter(e => {
  const r = e.getBoundingClientRect(); return r.height > 0 && r.height < 80 && e.closest('main,[data-dashboard-page],body') && (e.children.length === 0 || ['INPUT','TEXTAREA','BUTTON'].includes(e.tagName));
}).map(e => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return `${e.tagName.toLowerCase()} ${Math.round(r.height)} ${c.fontSize}/${c.fontWeight} «${(e.getAttribute('aria-label') || e.value || e.textContent || '').trim().slice(0, 18)}»`; });
for (const [vp, o] of Object.entries(VP).filter(([k]) => !only || k === only)) {
  const ctx = await b.newContext({ ...o, colorScheme: 'dark', reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  try {
    await p.goto(base + '/new', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    await p.locator('button,[role=radio],[role=option],a').filter({ hasText: /^Plan/ }).first().click(); await p.waitForTimeout(3000);
    await p.getByLabel('Find a board, sheet, form or layout').fill('overview'); await p.waitForTimeout(1500);
    await p.locator('button').filter({ hasText: /^Overview/ }).first().click(); await p.waitForTimeout(4000);
    for (const card of CARDS) {
      await p.getByRole('button', { name: 'Add to Slot' }).first().click({ force: true }); await p.waitForTimeout(1200);
      await p.getByRole('button', { name: /^Utilities/ }).first().click(); await p.waitForTimeout(800);
      await p.getByRole('button', { name: card }).first().click(); await p.waitForTimeout(1500);
    }
    await p.getByLabel('Date').first().fill('2027-01-15'); await p.keyboard.press('Enter'); await p.waitForTimeout(800);
    await p.mouse.click(5, 450); await p.waitForTimeout(800);
    const seen = new Set(); for (const m of await p.evaluate(measure)) if (/«(Title heading|Note heading|Why|Key Date heading|Date|Checklist heading|Links heading|On Track|Add Link|Add item|Section Title|No links|Nothing|\d+)/.test(m) && !seen.has(m)) { seen.add(m); console.log(label, vp, m); }
    await p.screenshot({ path: `${out}/${label}-5f-cards-${vp}.png`, fullPage: vp === 'phone' });
  } catch (e) { console.log(label, vp, 'ERR', String(e).split('\n')[0].slice(0, 160)); }
  await ctx.close();
}
await b.close();
