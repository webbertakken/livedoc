import type { LicencesManifest } from '@livedoc/licences';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LicencesView, sectionIntro } from './LicencesView';

const manifest: LicencesManifest = {
  schemaVersion: 1,
  sections: [
    {
      side: 'browser',
      apps: [
        { id: 'live', label: 'Editor' },
        { id: 'marketing', label: 'Website' },
      ],
      works: [
        {
          anchor: 'browser-next-16-3-6',
          kind: 'package',
          name: 'next',
          version: '16.3.6',
          licence: 'MIT',
          homepage: 'https://nextjs.org/',
          apps: ['live', 'marketing'],
          texts: [{ label: 'license.md', hash: 'aaaaaaaaaaaaaaaa' }],
        },
        {
          anchor: 'browser-xnnpack-5e8033a',
          kind: 'embedded',
          name: 'XNNPACK',
          version: '5e8033a',
          licence: 'BSD-3-Clause',
          carrier: '@tensorflow/tfjs-backend-wasm (WebAssembly)',
          apps: ['live'],
          texts: [{ label: 'LICENSE', hash: 'bbbbbbbbbbbbbbbb' }],
        },
      ],
    },
    { side: 'server', apps: [{ id: 'api', label: 'API' }], works: [] },
  ],
  texts: {
    aaaaaaaaaaaaaaaa: { lines: 4, bytes: 100 },
    bbbbbbbbbbbbbbbb: { lines: 300, bytes: 9000 },
  },
};

const html = renderToStaticMarkup(<LicencesView manifest={manifest} />);

describe('LicencesView', () => {
  // docs/specs/002-project-scope/livediagram-upstream.md: LiveDoc began as a fork of livediagram, whose MIT
  // notice LiveDoc keeps; the licences page says where the code came from.
  it('credits livediagram as the origin of the code, linked to its repository', () => {
    expect(html).toContain('LiveDoc is MIT licensed');
    expect(html).toContain('began as a fork of');
    expect(html).toMatch(
      /began as a fork of <a href="https:\/\/github\.com\/livediagram-app\/livediagram\.app"[^>]*>livediagram<\/a>/,
    );
  });

  it('titles the page and names both sections with their counts', () => {
    expect(html).toContain('<h1');
    expect(html).toContain('Open-source licences');
    expect(html).toMatch(/<h2[^>]*>In your browser<\/h2>/);
    expect(html).toMatch(/<h2[^>]*>On our servers<\/h2>/);
    expect(html).toContain('2 works');
    expect(html).toContain('0 works');
  });

  // docs/specs/002-project-scope/third-party-licences.md.
  it('names every app of each section in its intro, from the manifest', () => {
    expect(html).toContain('Sent to your browser by these apps: Editor and Website.');
    expect(html).toContain(
      'Bundled into these services, which run on Cloudflare rather than on your device: API.',
    );
  });

  it('joins three apps or more with commas and a last "and"', () => {
    expect(sectionIntro('server', ['API', 'MCP server', 'Router'])).toBe(
      'Bundled into these services, which run on Cloudflare rather than on your device: API, MCP server and Router.',
    );
  });

  it('renders each work as a collapsed disclosure anchored for deep links', () => {
    expect(html).toContain('<details id="browser-next-16-3-6"');
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html).toMatch(/<summary[^>]*><h3[^>]*>next<\/h3>/);
    expect(html).toContain('16.3.6');
    expect(html).toContain('BSD-3-Clause');
  });

  it('names the apps that ship each work', () => {
    expect(html).toMatch(/Ships in <\/span>[\s\S]*Editor[\s\S]*Website/);
  });

  it('says what carries a vendored or embedded work and links a safe source', () => {
    expect(html).toContain('Inside @tensorflow/tfjs-backend-wasm (WebAssembly).');
    expect(html).toContain('href="https://nextjs.org/"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('links every text as plain text and holds none inline', () => {
    expect(html).toContain('href="/about/licences/texts/aaaaaaaaaaaaaaaa.txt"');
    expect(html).toContain('href="/about/licences/texts/bbbbbbbbbbbbbbbb.txt"');
    expect(html).not.toContain('Permission is hereby granted');
  });

  it('sizes each text box from its line count, capped, before anything loads', () => {
    expect(html).toContain('height:calc(5rem + 1.5rem + 2px)');
    expect(html).toContain('height:calc(30rem + 1.5rem + 2px)');
  });

  it('says so when a section has nothing', () => {
    expect(html).toContain('Nothing third-party ships here.');
  });
});
