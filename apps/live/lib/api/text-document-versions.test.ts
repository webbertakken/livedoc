import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TextDocumentVersionDto } from '@livedoc/api-schema';
import {
  apiListTextDocumentVersions,
  apiNameCurrentTextDocumentVersion,
  apiNameTextDocumentVersion,
  apiReadTextDocumentVersion,
  apiRestoreTextDocumentVersion,
} from './text-document-versions';

// docs/specs/034-text-documents/live-editing-and-storage.md "The api".

function stub(response: () => Promise<Response>) {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(response);
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

const scope = { ownerId: 'me', documentId: 'D', tabId: 't1', shareCode: null };
const version: TextDocumentVersionDto = {
  id: 'v1',
  kind: 'named',
  name: 'Draft',
  takenAt: 1,
  takenBy: null,
  restoredFrom: null,
  editors: [],
};
const sent = (fetch: ReturnType<typeof stub>) => {
  const [url, init] = fetch.mock.calls[0]!;
  return {
    path: new URL(String(url), 'https://x.test').pathname,
    method: init?.method,
    body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
  };
};

describe('the version doors', () => {
  it('lists the versions', async () => {
    const fetch = stub(async () => Response.json({ versions: [version] }));
    expect(await apiListTextDocumentVersions(scope)).toEqual([version]);
    expect(sent(fetch)).toEqual({
      path: '/api/documents/D/text-documents/t1/versions',
      method: 'GET',
      body: undefined,
    });
  });

  it('reads one whole', async () => {
    const read = { version, snapshot: 'AA==', previous: 'AA==', clients: {}, deletedBy: {} };
    const fetch = stub(async () => Response.json(read));
    expect(await apiReadTextDocumentVersion(scope, 'v 1')).toEqual(read);
    expect(sent(fetch).path).toBe('/api/documents/D/text-documents/t1/versions/v%201');
  });

  it('names the current version with the sender’s label', async () => {
    const fetch = stub(async () => Response.json({ version }));
    const author = { name: 'Ada', color: '#1a73e8' };
    expect(await apiNameCurrentTextDocumentVersion(scope, 'Draft', author)).toEqual(version);
    expect(sent(fetch)).toEqual({
      path: '/api/documents/D/text-documents/t1/versions',
      method: 'POST',
      body: { name: 'Draft', author },
    });
  });

  it('names one version by PUT, with no label when none is given', async () => {
    const fetch = stub(async () => Response.json({ version }));
    await apiNameTextDocumentVersion(scope, 'v1', '');
    expect(sent(fetch)).toEqual({
      path: '/api/documents/D/text-documents/t1/versions/v1',
      method: 'PUT',
      body: { name: '' },
    });
  });

  it('restores one by POST on the version', async () => {
    const fetch = stub(async () => Response.json({ version }));
    await apiRestoreTextDocumentVersion(scope, 'v1', { name: 'Ada' });
    expect(sent(fetch)).toEqual({
      path: '/api/documents/D/text-documents/t1/versions/v1',
      method: 'POST',
      body: { author: { name: 'Ada' } },
    });
    stub(async () => Response.json({ version }));
    await apiRestoreTextDocumentVersion(scope, 'v1');
  });

  it('throws on a refusal', async () => {
    stub(async () => Response.json({ error: 'named_versions_full' }, { status: 409 }));
    await expect(apiNameTextDocumentVersion(scope, 'v1', 'x')).rejects.toThrow();
  });
});
