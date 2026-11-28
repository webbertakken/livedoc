import { describe, expect, it } from 'vitest';
import { createApiClient } from '@livedoc/api-client';

import { textDocumentPages } from './text-document-preview';

// The rasteriser is WASM; what is asked and answered is under test.
const draw = async (svg: string) => `png:${svg}`;

// docs/specs/034-text-documents/agents-and-sync.md "Page previews": the api's pages rasterised, its refusals in words.

const apiAnswering = (answer: (url: URL) => Response) => {
  const asked: string[] = [];
  const api = createApiClient({
    baseUrl: 'https://api.test/api',
    headers: () => ({}),
    fetch: async (request) => {
      const url = new URL(request.url);
      asked.push(`${url.pathname.replace(/^\/api/, '')}${url.search}`);
      return answer(url);
    },
  });
  return { api, asked };
};

describe('textDocumentPages', () => {
  it('asks for the pages and document tab, and rasterises each page in order', async () => {
    const { api, asked } = apiAnswering(() =>
      Response.json({
        pages: [
          { number: 2, width: 1, height: 1, svg: '<a/>' },
          { number: 3, width: 1, height: 1, svg: '<b/>' },
        ],
        pageCount: 5,
        approximate: true,
      }),
    );
    expect(
      await textDocumentPages(api, 'd 1', 'w', { pages: '2..3', only: 'Intro' }, draw),
    ).toEqual({
      ok: true,
      images: [
        { type: 'image', data: 'png:<a/>', mimeType: 'image/png' },
        { type: 'image', data: 'png:<b/>', mimeType: 'image/png' },
      ],
      pages: [2, 3],
      pageCount: 5,
    });
    expect(asked).toEqual(['/documents/d%201/tabs/w/page-previews?pages=2..3&only=Intro']);
  });

  it('answers a refusal in the api’s words, or its status when the body says none', async () => {
    const named = apiAnswering(() =>
      Response.json(
        { error: 'page_not_found', message: 'This document tab has 2 pages.' },
        { status: 404 },
      ),
    );
    expect(await textDocumentPages(named.api, 'd', 'w', { pages: '9' }, draw)).toEqual({
      ok: false,
      message: 'This document tab has 2 pages.',
    });
    const bare = apiAnswering(() => new Response('nope', { status: 403 }));
    expect(await textDocumentPages(bare.api, 'd', 'w', {}, draw)).toEqual({
      ok: false,
      message: 'api 403: nope',
    });
    const quiet = apiAnswering(() => Response.json({ error: 'x' }, { status: 400 }));
    expect(await textDocumentPages(quiet.api, 'd', 'w', {}, draw)).toMatchObject({ ok: false });
  });

  it('lets a failure of the api through', async () => {
    const down = apiAnswering(() => new Response('down', { status: 503 }));
    await expect(textDocumentPages(down.api, 'd', 'w', {}, draw)).rejects.toThrow('api 503');
  });
});
