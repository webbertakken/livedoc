import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiDownloadTextDocument,
  apiLoadTextDocumentState,
  apiLoadTextDocumentStateSince,
  apiPostTextDocumentUpdate,
} from './text-documents';

// docs/specs/034-text-documents/live-editing-and-storage.md "Reading it", "Sending" and "Reconnecting".

function stub(response: () => Promise<Response>) {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(response);
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

const scope = { ownerId: 'me', documentId: 'D', tabId: 't1', shareCode: 'code-1' };

describe('apiLoadTextDocumentStateSince', () => {
  it('asks for what the state holds beyond the vector, and reads the state’s own vector', async () => {
    const fetch = stub(
      async () => new Response(Uint8Array.of(7, 7), { headers: { 'X-State-Vector': 'AQID' } }),
    );
    const answer = await apiLoadTextDocumentStateSince(scope, Uint8Array.of(1, 2));
    expect(answer).toEqual({ update: Uint8Array.of(7, 7), stateVector: Uint8Array.of(1, 2, 3) });
    const sent = new URL(String(fetch.mock.calls[0]![0]), 'https://x.test');
    expect(sent.pathname).toBe('/api/documents/D/text-documents/t1/state');
    expect(sent.searchParams.get('since')).toBe('AQI=');
  });

  it('reads the whole state when the vector is too long for a URL', async () => {
    const fetch = stub(
      async () => new Response(Uint8Array.of(1), { headers: { 'X-State-Vector': 'AA==' } }),
    );
    await apiLoadTextDocumentStateSince(scope, new Uint8Array(4_000));
    expect(new URL(String(fetch.mock.calls[0]![0]), 'https://x.test').search).toBe('');
  });

  // live-editing-and-storage.md "A Viewer's copy": a Viewer's catch-up names the copy its state was read from.
  it('names the Viewer copy the state was read from, with or without the vector', async () => {
    const fetch = stub(
      async () =>
        new Response(Uint8Array.of(1), {
          headers: { 'X-State-Vector': 'AA==', 'X-Viewer-Copy': 'copy-1' },
        }),
    );
    const viewers = { ...scope, tabId: 't9' };
    await apiLoadTextDocumentState(viewers);
    await apiLoadTextDocumentStateSince(viewers, Uint8Array.of(1, 2));
    await apiLoadTextDocumentStateSince(viewers, new Uint8Array(4_000));
    const sent = fetch.mock.calls.map((c) => new URL(String(c[0]), 'https://x.test').searchParams);
    expect(sent[1]!.get('copy')).toBe('copy-1');
    expect(sent[1]!.get('since')).toBe('AQI=');
    expect(sent[2]!.get('copy')).toBe('copy-1');
    expect(sent[2]!.has('since')).toBe(false);
    // Read again as no Viewer (the level raised), the copy is forgotten.
    stub(async () => new Response(Uint8Array.of(1), { headers: { 'X-State-Vector': 'AA==' } }));
    await apiLoadTextDocumentState(viewers);
    const after = stub(
      async () => new Response(Uint8Array.of(1), { headers: { 'X-State-Vector': 'AA==' } }),
    );
    await apiLoadTextDocumentStateSince(viewers, Uint8Array.of(1));
    const query = new URL(String(after.mock.calls[0]![0]), 'https://x.test').searchParams;
    expect(query.has('copy')).toBe(false);
  });

  it('refuses an answer without the state’s vector', async () => {
    stub(async () => new Response(Uint8Array.of(1)));
    await expect(apiLoadTextDocumentStateSince(scope, Uint8Array.of(1))).rejects.toThrow();
  });
});

describe('apiPostTextDocumentUpdate', () => {
  it('sends the update’s bytes through the share code, and throws on a refusal', async () => {
    const fetch = stub(async () => new Response(null, { status: 204 }));
    await apiPostTextDocumentUpdate(scope, Uint8Array.of(4, 5));
    const [url, init] = fetch.mock.calls[0]!;
    expect(new URL(String(url), 'https://x.test').pathname).toBe(
      '/api/documents/D/text-documents/t1/updates',
    );
    expect(init?.method).toBe('POST');
    expect(new Uint8Array(init?.body as ArrayBuffer)).toEqual(Uint8Array.of(4, 5));
    expect(new Headers(init?.headers).get('X-Share-Code')).toBe('code-1');
    stub(async () => Response.json({ error: 'update_too_large' }, { status: 413 }));
    await expect(apiPostTextDocumentUpdate(scope, Uint8Array.of(1))).rejects.toThrow();
  });
});

// files-and-print.md "Downloading"; objects.md "Where the bytes live": the pictures a download left out are counted.
describe('apiDownloadTextDocument', () => {
  it('reads the file, its name, and the pictures it left out', async () => {
    stub(
      async () =>
        new Response(Uint8Array.of(1, 2), {
          headers: {
            'Content-Disposition': 'attachment; filename="Q3.docx"',
            'X-Pictures-Left-Out': '2',
          },
        }),
    );
    const file = await apiDownloadTextDocument(scope, 'docx');
    expect(file.fileName).toBe('Q3.docx');
    expect(file.leftOut).toBe(2);
    expect(new Uint8Array(await file.blob.arrayBuffer())).toEqual(Uint8Array.of(1, 2));
  });

  it('counts none where the answer says nothing of pictures', async () => {
    stub(async () => new Response(Uint8Array.of(1)));
    expect((await apiDownloadTextDocument(scope, 'odt')).leftOut).toBe(0);
  });
});
