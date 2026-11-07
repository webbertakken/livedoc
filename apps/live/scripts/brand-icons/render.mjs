// Writes every static copy of the brand mark from its one source, the Page Stack module in @livedoc/ui
// (docs/specs/004-interface-design/brand-mark.md); the files, sizes and paths are listed in
// docs/specs/004-interface-design/brand-mark.md:
//   - apps/*/app/icon.svg: the compact mark, light/dark by prefers-color-scheme
//   - apps/marketing/public/favicon.ico: 16, 32 and 48px, for browsers and tools that ask for it by name
//   - apps/marketing/public/: the install icons (transparent marks, maskable tiles, the monochrome silhouette)
//   - apps/help/app/icon.png: the 256px transparent mark, its favicon's PNG fallback
//   - apps/marketing/public/email/livedoc-mark-64.png: the transparent 64px mark the api's emails show beside the
//     wordmark (2x their 28px slot); its path never changes
//   - marketing/media/logo/: the full mark (light, dark, mono black and white) and the lockup (SVG and PNG)
//   - marketing/media/icons/: transparent PNGs at Google Drive's sizes, and white-tile PNGs
// Run via `pnpm icons:brand` from the repo root. apps/marketing/lib/brand-icon.test.ts fails when a committed file
// drifts from the module or a raster is missing.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../../../', import.meta.url));

// The module is TypeScript importing other workspace TypeScript, so bundle it to one ESM file in memory and
// import that.
const bundle = await build({
  stdin: {
    contents:
      "export { brandMarkSvg } from './packages/ui/src/brand-mark-geometry';" +
      "export { brandLogoSvg } from './packages/ui/src/brand-logo-svg';",
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
});
const { brandMarkSvg, brandLogoSvg } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const mkdirFor = (path) =>
  mkdirSync(`${root}${path.slice(0, path.lastIndexOf('/'))}`, { recursive: true });
const write = (path, text) => {
  mkdirFor(path);
  writeFileSync(`${root}${path}`, text);
  console.log(`brand-icons: ${path}`);
};

// ---- Vector files ----
const favicon = brandMarkSvg({ variant: 'compact', scheme: 'auto' });
for (const app of ['marketing', 'live', 'help', 'telemetry']) {
  write(`apps/${app}/app/icon.svg`, `${favicon}\n`);
}
for (const scheme of ['light', 'dark']) {
  write(
    `marketing/media/logo/livedoc-mark-${scheme}.svg`,
    `${brandMarkSvg({ variant: 'full', scheme })}\n`,
  );
  write(`marketing/media/logo/livedoc-logo-${scheme}.svg`, `${brandLogoSvg(scheme)}\n`);
}
for (const [name, colour] of [
  ['black', '#000000'],
  ['white', '#ffffff'],
]) {
  write(
    `marketing/media/logo/livedoc-mark-mono-${name}.svg`,
    `${brandMarkSvg({ variant: 'full', tone: 'mono', colour })}\n`,
  );
}

// ---- Rasters ----
// Below 48px the compact drawing; from 48px the full one (the spec's split).
const markFor = (size) =>
  brandMarkSvg({ variant: size >= 48 ? 'full' : 'compact', scheme: 'light' });
// The share of a white tile the mark fills, as on the Apple icon (132 of 180).
const TILE_FILL = 132 / 180;
// The share of a maskable tile the mark fills: every corner of the stack inside the safe zone, the centre circle
// of 80% of the tile's width.
const MASKABLE_FILL = 0.56;

const browser = await chromium.launch();

// Renders `svg` at `markSize` centred on a `size` square, on `background` (transparent when null).
async function shoot({ svg, size, markSize = size, background = null, path }) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await page.setContent(
    `<html style="margin:0;background:${background ?? 'transparent'}"><body style="margin:0;` +
      `display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">` +
      `<img src="${src}" width="${markSize}" height="${markSize}" style="display:block"></body></html>`,
  );
  await page.locator('img').evaluate((img) => img.decode());
  const png = await page.screenshot({ omitBackground: !background });
  await page.close();
  if (path) {
    mkdirFor(path);
    writeFileSync(`${root}${path}`, png);
    console.log(`brand-icons: ${size}x${size} -> ${path}`);
  }
  return png;
}
const tile = (size, path) =>
  shoot({
    svg: markFor(Math.round(size * TILE_FILL)),
    size,
    markSize: Math.round(size * TILE_FILL),
    background: '#ffffff',
    path,
  });

for (const size of [16, 32, 64, 128, 256, 512]) {
  await shoot({
    svg: markFor(size),
    size,
    path: `marketing/media/icons/livedoc-icon-transparent-${size}.png`,
  });
}
for (const size of [256, 512, 1024])
  await tile(size, `marketing/media/icons/livedoc-icon-${size}.png`);

// The manifest (apps/marketing/app/manifest.ts): transparent marks for `any`, which install dialogs and launchers
// show as they are; full-bleed white tiles with the stack inside the safe zone for `maskable`; and a white
// silhouette for `monochrome` (themed launchers keep only its alpha).
for (const size of [192, 256, 512])
  await shoot({ svg: markFor(size), size, path: `apps/marketing/public/livedoc-icon-${size}.png` });
for (const size of [192, 512]) {
  const markSize = Math.round(size * MASKABLE_FILL);
  await shoot({
    svg: markFor(markSize),
    size,
    markSize,
    background: '#ffffff',
    path: `apps/marketing/public/livedoc-maskable-${size}.png`,
  });
}
await shoot({
  svg: brandMarkSvg({ variant: 'compact', tone: 'mono', colour: '#ffffff' }),
  size: 512,
  markSize: Math.round(512 * MASKABLE_FILL),
  path: 'apps/marketing/public/livedoc-monochrome-512.png',
});

// The apps that serve their own icon under a basePath pair app/icon.svg with this PNG (Next emits both links).
for (const app of ['help']) {
  copyFileSync(
    `${root}apps/marketing/public/livedoc-icon-256.png`,
    `${root}apps/${app}/app/icon.png`,
  );
  console.log(`brand-icons: apps/${app}/app/icon.png`);
}

// favicon.ico: PNG-compressed images at 16, 32 and 48px, the compact drawing, transparent. An ICO is a 6-byte
// header, a 16-byte entry per image (width, height, colours, reserved, planes, bits, byte size, offset), then the
// images.
const icoImages = [];
for (const size of [16, 32, 48])
  icoImages.push({ size, png: await shoot({ svg: markFor(size), size }) });
const header = Buffer.alloc(6 + 16 * icoImages.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoImages.length, 4);
let offset = header.length;
icoImages.forEach(({ size, png }, i) => {
  const at = 6 + i * 16;
  header.writeUInt8(size, at);
  header.writeUInt8(size, at + 1);
  header.writeUInt8(0, at + 2);
  header.writeUInt8(0, at + 3);
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(png.length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += png.length;
});
writeFileSync(
  `${root}apps/marketing/public/favicon.ico`,
  Buffer.concat([header, ...icoImages.map((i) => i.png)]),
);
console.log('brand-icons: apps/marketing/public/favicon.ico (16, 32, 48)');

// The lockup as PNG, 1200px wide, transparent, for press and listings.
for (const scheme of ['light', 'dark']) {
  const svg = brandLogoSvg(scheme);
  const [, , w, h] = svg
    .match(/viewBox="([^"]+)"/)[1]
    .split(' ')
    .map(Number);
  const width = 1200;
  const height = Math.round((width * h) / w);
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(
    `<html style="margin:0;background:transparent"><body style="margin:0">` +
      `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${width}" height="${height}" style="display:block"></body></html>`,
  );
  await page.locator('img').evaluate((img) => img.decode());
  write(
    `marketing/media/logo/livedoc-logo-${scheme}.png`,
    await page.screenshot({ omitBackground: true }),
  );
  await page.close();
}

// Emails load the mark from the public site (Gmail and Outlook drop SVG), so a transparent copy is served at a
// path no other asset will ever claim.
mkdirSync(`${root}apps/marketing/public/email`, { recursive: true });
copyFileSync(
  `${root}marketing/media/icons/livedoc-icon-transparent-64.png`,
  `${root}apps/marketing/public/email/livedoc-mark-64.png`,
);
console.log('brand-icons: apps/marketing/public/email/livedoc-mark-64.png');
await browser.close();
