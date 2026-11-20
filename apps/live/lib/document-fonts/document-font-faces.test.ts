// docs/specs/004-interface-design/fonts.md "Served from LiveDoc".
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCUMENT_FONTS, servedFamily, type DocumentFont } from '@livedoc/document';
import { DOCUMENT_FONT_FILES, documentFontFaceCss } from './document-font-faces';

const APP = join(import.meta.dirname, '../..');
const readPackage = (path: string) =>
  readFileSync(join(APP, 'node_modules/@fontsource', path), 'utf8');

const SHEET = `/* demo-latin-ext-400-normal */
@font-face {
  font-family: 'Demo';
  src: url(./files/demo-latin-ext-400-normal.woff2) format('woff2');
  unicode-range: U+0100-02BA;
}

/* demo-cyrillic-400-normal */
@font-face {
  src: url(./files/demo-cyrillic-400-normal.woff2) format('woff2');
  unicode-range: U+0400-045F;
}

/* demo-latin-400-normal */
@font-face {
  src: url(./files/demo-latin-400-normal.woff2) format('woff2');
}
`;

describe('documentFontFaceCss', () => {
  const demo: DocumentFont = {
    name: 'Demo Sans',
    generic: 'swiss',
    pitch: 'variable',
    menu: true,
    served: { id: 'demo', styles: ['400-normal'] },
  };

  it('keeps the Latin subsets, each with its range, as WOFF2 under the served name', () => {
    const css = documentFontFaceCss(
      [demo, { ...demo, name: 'Arial', served: undefined }],
      servedFamily,
      () => SHEET,
    );
    expect(css.match(/@font-face/g)).toHaveLength(2);
    expect(css).toContain('font-family: "LiveDoc Demo Sans";');
    expect(css).toContain(
      `url("${DOCUMENT_FONT_FILES}/demo/files/demo-latin-ext-400-normal.woff2")`,
    );
    expect(css).toContain('unicode-range: U+0100-02BA;');
    expect(css).not.toContain('cyrillic');
    expect(css).not.toContain('Arial');
  });

  it('reads an italic or bold face from its own sheet', () => {
    const read = (path: string) => {
      expect(path).toBe('demo/700-italic.css');
      return SHEET.replaceAll('400-normal', '700-italic');
    };
    const css = documentFontFaceCss(
      [{ ...demo, served: { id: 'demo', styles: ['700-italic'] } }],
      servedFamily,
      read,
    );
    expect(css).toContain('font-style: italic;\n  font-weight: 700;');
  });

  it('is the committed stylesheet, every file it names installed', () => {
    const css = documentFontFaceCss(DOCUMENT_FONTS, servedFamily, readPackage);
    expect(readFileSync(join(APP, 'app/document-fonts.css'), 'utf8')).toBe(css);
    for (const [, url] of css.matchAll(/url\("([^"]+)"\)/g))
      expect(existsSync(join(APP, 'app', url!)), url).toBe(true);
  });
});
