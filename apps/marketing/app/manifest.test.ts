import { describe, expect, it } from 'vitest';
import { PUBLIC_VIEWPORT } from '@livedoc/ui';
import manifest from './manifest';

// docs/specs/004-interface-design/brand-mark.md "Icons and media": Android's icons, each with its purpose.
describe('web app manifest', () => {
  const icons = manifest().icons ?? [];
  const by = (purpose: string) => icons.filter((i) => i.purpose === purpose).map((i) => i.src);

  it('names LiveDoc', () => {
    expect(manifest()).toMatchObject({ name: 'LiveDoc', short_name: 'LiveDoc' });
  });

  // docs/specs/004-interface-design/appearance.md "The browser's chrome": the page's theme-color colours the title bar;
  // a manifest colour would paint an installed app's navigation bar one fixed colour, white under a dark page.
  it('starts an installed app on the homepage and leaves its system bars to the page and the device', () => {
    expect(manifest()).toMatchObject({ start_url: '/' });
    expect(manifest()).not.toHaveProperty('theme_color');
  });

  it('leaves theme-color to the appearance script, which knows light from dark', () => {
    expect(PUBLIC_VIEWPORT).not.toHaveProperty('themeColor');
  });

  it('lists the SVG and the 192 and 512px transparent marks for any launcher', () => {
    expect(by('any')).toEqual(['/icon.svg', '/livedoc-icon-192.png', '/livedoc-icon-512.png']);
  });

  it('lists maskable tiles that keep the stack inside the safe zone', () => {
    expect(by('maskable')).toEqual(['/livedoc-maskable-192.png', '/livedoc-maskable-512.png']);
  });

  it('lists a monochrome silhouette for themed launchers', () => {
    expect(by('monochrome')).toEqual(['/livedoc-monochrome-512.png']);
  });
});
