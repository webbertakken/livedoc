// @vitest-environment jsdom
// docs/specs/004-interface-design/fonts.md "More fonts": loading a family, and the rows' previews, from Google Fonts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoogleFont } from './google-font-catalogue';
import {
  createGoogleFontLoads,
  googleFontHref,
  googleFontLoads,
  googlePreviewHref,
  previewFamily,
  renamePreviewCss,
} from './google-font-loading';

const font = (name: string, axes = ''): GoogleFont => ({
  name,
  category: 'Sans Serif',
  popularity: 1,
  trending: 1,
  dateAdded: '2020-01-01',
  axes,
});

afterEach(() => {
  document.head.innerHTML = '';
  vi.restoreAllMocks();
});

describe('hrefs', () => {
  it('asks css2 for a family with its axes, swapping', () => {
    expect(googleFontHref(font('Open Sans', 'ital,wght@0,400;1,400'))).toBe(
      'https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;1,400&display=swap',
    );
    expect(googleFontHref(font('Abel'))).toBe(
      'https://fonts.googleapis.com/css2?family=Abel&display=swap',
    );
  });

  it('asks for the letters of the names only, once each, in one request', () => {
    expect(googlePreviewHref([font('Abel'), font('Bea & Co')])).toBe(
      'https://fonts.googleapis.com/css2?family=Abel&family=Bea+%26+Co&text=AbelBa%20%26Co&display=swap',
    );
  });
});

describe('renamePreviewCss (a preview never stands in for the full faces)', () => {
  it('renames every face to its preview name', () => {
    const css =
      "@font-face {\n  font-family: 'Abel';\n  src: url(a);\n}\n@font-face { font-family:'Open Sans'; }";
    expect(renamePreviewCss(css)).toBe(
      "@font-face {\n  font-family: 'LiveDoc preview Abel';\n  src: url(a);\n}\n@font-face { font-family:'LiveDoc preview Open Sans'; }",
    );
    expect(previewFamily('Abel')).toBe('LiveDoc preview Abel');
  });
});

describe('googleFontLoads', () => {
  it('is one set of loads for the page', () => {
    expect(googleFontLoads()).toBe(googleFontLoads());
  });
});

describe('GoogleFontLoads', () => {
  const logs = () => vi.spyOn(console, 'info').mockImplementation(() => {});

  it('loads a family once, by its stylesheet, and tells when it loaded', () => {
    const log = logs();
    const loads = createGoogleFontLoads(vi.fn());
    const heard = vi.fn();
    loads.subscribe(heard);
    loads.load(font('Rubik', 'wght@400;700'));
    loads.load(font('Rubik', 'wght@400;700'));
    const links = document.head.querySelectorAll<HTMLLinkElement>('link[data-google-font]');
    expect(links).toHaveLength(1);
    expect(links[0]!.rel).toBe('stylesheet');
    expect(links[0]!.href).toBe(googleFontHref(font('Rubik', 'wght@400;700')));
    expect(loads.status('rubik')).toBe('loading');
    const before = loads.statuses();
    expect(before.get('rubik')).toBe('loading');
    links[0]!.dispatchEvent(new Event('load'));
    expect(loads.status('Rubik')).toBe('loaded');
    expect(loads.statuses()).not.toBe(before);
    expect(heard).toHaveBeenCalledTimes(2);
    expect(log.mock.calls.flat().join(' ')).toContain('[fonts] google family loaded Rubik');
  });

  it('marks a family that cannot load, and says so', () => {
    const log = logs();
    const loads = createGoogleFontLoads(vi.fn());
    expect(loads.status('Rubik')).toBe('idle');
    loads.load(font('Rubik'));
    document.head.querySelector('link')!.dispatchEvent(new Event('error'));
    expect(loads.status('Rubik')).toBe('failed');
    expect(log.mock.calls.flat().join(' ')).toContain('[fonts] google family not loaded Rubik');
  });

  it('stops telling a listener that left', () => {
    const loads = createGoogleFontLoads(vi.fn());
    const heard = vi.fn();
    loads.subscribe(heard)();
    loads.load(font('Rubik'));
    expect(heard).not.toHaveBeenCalled();
  });

  it('previews the rows not previewed yet in one request, renamed', async () => {
    const fetchCss = vi.fn(async () => new Response("@font-face { font-family: 'Abel'; }"));
    const loads = createGoogleFontLoads(fetchCss);
    await loads.preview([font('Abel'), font('Rubik')]);
    await loads.preview([font('Abel')]);
    expect(fetchCss).toHaveBeenCalledTimes(1);
    expect(fetchCss).toHaveBeenCalledWith(googlePreviewHref([font('Abel'), font('Rubik')]));
    const style = document.head.querySelector('style[data-google-font-preview]');
    expect(style?.textContent).toBe("@font-face { font-family: 'LiveDoc preview Abel'; }");
  });

  it('logs a preview that failed, and draws the rows in the dialog face', async () => {
    const log = logs();
    const loads = createGoogleFontLoads(vi.fn(async () => new Response('', { status: 400 })));
    await loads.preview([font('Abel')]);
    const offline = createGoogleFontLoads(
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    await offline.preview([font('Abel')]);
    expect(document.head.querySelector('style')).toBeNull();
    const said = log.mock.calls.flat().join(' ');
    expect(said).toContain('[fonts] google preview not loaded Error: 400');
    expect(said).toContain('[fonts] google preview not loaded TypeError: offline');
  });
});
