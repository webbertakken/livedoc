import { CHROME_SURFACES, SITE_DESCRIPTION } from '@livedoc/ui';
import type { MetadataRoute } from 'next';

// Required for `output: 'export'`: route handlers must declare
// themselves fully static so Next resolves them at build time, same
// rule that applies to robots.ts and sitemap.ts.
export const dynamic = 'force-static';

// Next.js convention: app/manifest.ts → /manifest.webmanifest at build
// time. See docs/specs/019-marketing/marketing-site.md "SEO and metadata".
//
// What this unlocks:
//   - Android Chrome "Add to Home Screen" prompt + a proper standalone
//     launch experience (no URL bar) once installed.
//   - iOS Safari "Add to Home Screen" picks the manifest icon + name
//     for the homescreen tile.
//   - Lighthouse PWA audit gets the basic-installability check.
//
// Icons (docs/specs/004-interface-design/brand-mark.md). /icon.svg is the scalable master
// (Next.js also auto-emits a <link> for app/icon.svg); the 192 and 512px transparent PNGs serve install dialogs, launchers and
// the Lighthouse installability check that want a concrete raster. The maskable tiles draw the stack at 56% of the
// tile, inside the safe zone (the centre circle of 80%), so a circle or squircle mask never clips a sheet. The
// monochrome silhouette is for Android's themed icons, which keep only its alpha. An opaque, iOS-friendly
// home-screen tile is app/apple-icon.tsx (iOS renders transparency as black).
//
// theme_color is the homepage's light ground, where start_url opens: an installed app's title bar starts there, then
// the appearance script points the page's theme-color meta at the page's top as painted (docs/specs/004-interface-design/appearance.md "The
// browser's chrome"). background_color paints the splash screen behind the icon at launch.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LiveDoc',
    short_name: 'LiveDoc',
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    theme_color: CHROME_SURFACES.ground.light,
    background_color: '#ffffff',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/livedoc-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/livedoc-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/livedoc-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/livedoc-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/livedoc-monochrome-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'monochrome',
      },
    ],
  };
}
