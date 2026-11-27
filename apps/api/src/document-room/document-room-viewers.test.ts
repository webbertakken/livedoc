import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VIEWER_COPY_CHANGED_CLOSE, type AccessLevel } from '@livedoc/api-schema';
import {
  base64OfBytes,
  bytesOfBase64,
  LiveThreads,
  TextDocumentState,
  ViewerCopy,
} from '@livedoc/text-documents';
import { roomNetwork, tabSeed } from '../test-room-network';
import { DOCUMENT_ID_HEADER } from './document-client';

// docs/specs/034-text-documents/review.md "What a Viewer receives"; live-editing-and-storage.md "A Viewer's copy": a
// Viewer's connection and state door carry no comment and no suggestion's author, an Editor's carry the document.

const ADA = { key: 'key-ada-77', name: 'Ada Secretname', colour: '#1a73e8' };
const SECRET = 'Confidential remark';
const LEAKS = [SECRET, ADA.name, ADA.key, 'thread-'];
const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

type Fake = { ws: WebSocket; sent: string[]; close: ReturnType<typeof vi.fn> };

function fakeSocket(): Fake {
  const sent: string[] = [];
  const close = vi.fn();
  let attachment: unknown = null;
  const ws = {
    send: (data: string) => void sent.push(data),
    close,
    serializeAttachment: (value: unknown) => void (attachment = value),
    deserializeAttachment: () => attachment,
  } as unknown as WebSocket;
  return { ws, sent, close };
}

/** Everything a socket was sent, its text and every update it carries decoded. */
function received(socket: Fake): string {
  const parts: string[] = [];
  for (const raw of socket.sent) {
    parts.push(raw);
    const frame = JSON.parse(raw) as {
      op?: { update?: unknown };
      ops?: { op?: { update?: unknown } }[];
    };
    for (const op of [frame.op, ...(frame.ops ?? []).map((o) => o.op)])
      if (typeof op?.update === 'string') parts.push(latin1(bytesOfBase64(op.update)!));
  }
  return parts.join('\n');
}

const textOps = (socket: Fake) =>
  socket.sent
    .map((raw) => JSON.parse(raw) as { kind: string; op?: Record<string, unknown> })
    .filter((f) => f.kind === 'op' && f.op?.kind === 'text-document')
    .map((f) => f.op!);

let browser: ReturnType<typeof TextDocumentState.load>;

/** A frame of Ada's: a paragraph suggested by her, her thread on it. */
function adasFrame(text: string) {
  const before = TextDocumentState.stateVectorOf(TextDocumentState.encode(browser));
  browser.transact(() => {
    const texts = TextDocumentState.paragraphs(browser)
      .map((p) => p.text)
      .filter((t) => t !== '');
    TextDocumentState.replaceBody(
      browser,
      [...texts, text].map((t) => ({ text: t })),
    );
    const run = (
      TextDocumentState.body(browser).get(texts.length) as unknown as {
        get: (i: number) => { format: (at: number, length: number, attributes: object) => void };
      }
    ).get(0);
    run.format(0, text.length, { insertion: { id: `s-${text}`, at: 1, author: ADA } });
    LiveThreads.begin(
      browser,
      {
        id: `thread-${text}`,
        tab: 't.0',
        ...LiveThreads.anchorFor(TextDocumentState.body(browser), 0, 1),
        quote: text,
        comment: { id: `c-${text}`, text: SECRET, at: 1, author: ADA },
      },
      'test',
    );
  });
  const update = TextDocumentState.since(TextDocumentState.encode(browser), before);
  return { kind: 'text-document', tabId: 't1', update: base64OfBytes(update) };
}

async function setup() {
  const net = roomNetwork(['A']);
  const handle = net.room('A');
  await handle.room.create('A', {
    ...tabSeed([]),
    tabs: [{ id: 't1', name: 'T', kind: 'text-document', elements: [] } as never],
  });
  const join = (level: AccessLevel, name: string) => {
    const socket = fakeSocket();
    handle.room.acceptSession(
      socket.ws,
      level,
      level === 'edit',
      null,
      null,
      false,
      null,
      null,
      null,
      `k-${name}`,
      'A',
    );
    const session = socket.ws.deserializeAttachment() as Record<string, unknown>;
    socket.ws.serializeAttachment({
      ...session,
      presence: { id: name, name, color: '#123456', role: level },
    });
    return socket;
  };
  const send = async (from: Fake, op: unknown) => {
    handle.room.webSocketMessage(from.ws, JSON.stringify({ kind: 'op', op }));
    await vi.waitFor(async () => {
      const count = handle.sql.prepare('SELECT COUNT(*) AS n FROM text_document_updates').get() as {
        n: number;
      };
      expect(count.n).toBeGreaterThan(0);
    });
    await new Promise((r) => setTimeout(r, 0));
  };
  const viewerState = async (since?: { since: string; copy: string | null }) =>
    handle.room.fetch(
      new Request('https://room/text-document-viewer-state', {
        method: 'POST',
        headers: { [DOCUMENT_ID_HEADER]: 'A', 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: 'A', tabId: 't1', ...since }),
      }),
    );
  const copyRows = () =>
    (
      handle.sql.prepare('SELECT COUNT(*) AS n FROM text_document_viewer_copy_updates').get() as {
        n: number;
      }
    ).n;
  return { handle, join, send, viewerState, copyRows };
}

beforeEach(() => {
  browser = TextDocumentState.load();
  browser.clientID = 616_161;
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('DocumentRoom, a Viewer of a text document', () => {
  it('sends a Viewer only its copy, an Editor the document', async () => {
    const { join, send, viewerState } = await setup();
    const ada = join('edit', 'Ada');
    const other = join('edit', 'Bo');
    const viewer = join('view', 'Vi');
    await send(ada, adasFrame('One'));
    // No Viewer has read the tab yet: nothing of it reaches them.
    expect(textOps(viewer)).toEqual([]);
    const read = await viewerState();
    expect(read.status).toBe(200);
    const copy = read.headers.get('X-Viewer-Copy');
    expect(copy).toMatch(/^[0-9a-f-]{36}$/);
    expect(read.headers.get('X-State-Vector')).toBeTruthy();
    const state = new Uint8Array(await read.arrayBuffer());
    expect(latin1(state)).toContain('One');
    for (const leak of LEAKS) expect(latin1(state), leak).not.toContain(leak);
    await send(ada, adasFrame('Two'));
    expect(textOps(viewer)).toEqual([expect.objectContaining({ tabId: 't1', viewerCopy: copy })]);
    for (const leak of LEAKS) expect(received(viewer), leak).not.toContain(leak);
    expect(received(other)).toContain(SECRET);
    const op = textOps(viewer)[0]!;
    expect(
      TextDocumentState.paragraphs(
        TextDocumentState.load([state, bytesOfBase64(op.update as string)!]),
      ).map((p) => p.text),
    ).toEqual(['One', 'Two']);
  });
  it('replays a Viewer its copy’s ops on catch-up, never the document’s', async () => {
    const { handle, join, send, viewerState } = await setup();
    const ada = join('edit', 'Ada');
    const viewer = join('view', 'Vi');
    const editor = join('edit', 'Bo');
    await send(ada, adasFrame('One'));
    await viewerState();
    await send(ada, adasFrame('Two'));
    viewer.sent.length = 0;
    editor.sent.length = 0;
    for (const socket of [viewer, editor])
      handle.room.webSocketMessage(
        socket.ws,
        JSON.stringify({ kind: 'sync', epoch: null, lastSeq: 0 }),
      );
    const catchup = (socket: Fake) =>
      (JSON.parse(socket.sent.at(-1)!) as { ops: { op: Record<string, unknown> }[] }).ops.map(
        (o) => o.op,
      );
    expect(catchup(viewer)).toEqual([expect.objectContaining({ viewerCopy: expect.any(String) })]);
    expect(catchup(editor)).toHaveLength(2);
    for (const leak of LEAKS) expect(received(viewer), leak).not.toContain(leak);
    expect(received(editor)).toContain(SECRET);
  });

  it('answers a Viewer’s catch-up from its copy, and refuses one from another copy', async () => {
    const { join, send, viewerState } = await setup();
    const ada = join('edit', 'Ada');
    join('view', 'Vi');
    await send(ada, adasFrame('One'));
    const read = await viewerState();
    const copy = read.headers.get('X-Viewer-Copy');
    const vector = read.headers.get('X-State-Vector')!;
    await send(ada, adasFrame('Two'));
    const since = await viewerState({ since: vector, copy });
    expect(since.status).toBe(200);
    expect(latin1(new Uint8Array(await since.arrayBuffer()))).toContain('Two');
    const other = await viewerState({ since: vector, copy: 'another' });
    expect(other.status).toBe(409);
    expect(await other.json()).toEqual({ error: 'viewer_copy_changed' });
    const bad = await viewerState({ since: '***', copy });
    expect(bad.status).toBe(400);
  });

  it('closes every Viewer when their copy is let go, an Editor kept', async () => {
    const { join, send, viewerState } = await setup();
    const ada = join('edit', 'Ada');
    const viewer = join('view', 'Vi');
    await send(ada, adasFrame('One'));
    await viewerState();
    vi.spyOn(ViewerCopy.prototype, 'apply').mockImplementationOnce(() => {
      throw new Error('torn');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await send(ada, adasFrame('Two'));
    expect(viewer.close).toHaveBeenCalledWith(VIEWER_COPY_CHANGED_CLOSE, 'viewer-copy-changed');
    expect(ada.close).not.toHaveBeenCalled();
    expect(textOps(viewer)).toEqual([]);
  });

  it('lets the copies go when the last Viewer leaves, not before', async () => {
    const { handle, join, send, viewerState, copyRows } = await setup();
    const ada = join('edit', 'Ada');
    const first = join('view', 'Vi');
    const second = join('view', 'Wu');
    await send(ada, adasFrame('One'));
    await viewerState();
    expect(copyRows()).toBe(1);
    const leave = async (socket: Fake) => {
      handle.sockets.splice(handle.sockets.indexOf(socket.ws), 1);
      handle.room.webSocketClose(socket.ws);
      await new Promise((r) => setTimeout(r, 0));
    };
    await leave(first);
    expect(copyRows()).toBe(1);
    await leave(ada);
    expect(copyRows()).toBe(1);
    await leave(second);
    await vi.waitFor(() => expect(copyRows()).toBe(0));
  });

  it('answers a Viewer’s read unavailable where the copy cannot be made', async () => {
    const { join, send, viewerState } = await setup();
    const ada = join('edit', 'Ada');
    join('view', 'Vi');
    await send(ada, adasFrame('One'));
    vi.spyOn(ViewerCopy, 'build').mockImplementationOnce(() => {
      throw new Error('broken');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const read = await viewerState();
    expect(read.status).toBe(503);
    expect(await read.json()).toEqual({ error: 'viewer_copy_unavailable' });
  });

  it('refuses a read that is not one', async () => {
    const { handle } = await setup();
    const read = await handle.room.fetch(
      new Request('https://room/text-document-viewer-state', {
        method: 'POST',
        headers: { [DOCUMENT_ID_HEADER]: 'A' },
        body: JSON.stringify({ tabId: 't1' }),
      }),
    );
    expect(read.status).toBe(400);
  });
});
