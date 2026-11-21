import { describe, expect, it } from 'vitest';
import { Body, TextDocumentState } from '@livedoc/text-documents';
import { sqliteD1 } from '../test-sqlite-d1';
import { handleDocuments } from '../routes/documents';
import { makeTestRouteContext } from '../routes/test-route-context';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';
import { appendLiveTabUpdate } from './live-tab-store';
import { liveTabLimitOf } from './live-tab-limits';

// docs/specs/006-document/kinds-outside-the-canvas.md "Live state"; 034-text-documents/live-editing-and-storage.md
// "Refused edits": a text document's.
describe('liveTabLimitOf', () => {
  async function room() {
    const db = sqliteD1();
    await handleDocuments(
      makeTestRouteContext('POST', '/api/documents', {
        env: db.env,
        owner: 'owner',
        body: {
          id: 'D',
          name: 'D',
          tabs: [{ id: 't1', name: 'T', kind: 'text-document', elements: [] }],
        },
      }),
    );
    return db;
  }
  const digest = (db: ReturnType<typeof sqliteD1>, characters: number) =>
    db.sql
      .prepare(
        `INSERT OR REPLACE INTO text_document_digest (tab_id, characters, words, pages, has_content, state_bytes, written_at)
         VALUES ('t1', ?, 0, 1, 1, 0, 1)`,
      )
      .run(characters);

  it('passes an update within both limits', async () => {
    const db = await room();
    expect(
      await liveTabLimitOf(
        db.env,
        TEXT_DOCUMENT_LIVE_TAB,
        't1',
        TextDocumentState.fromBody(Body.of('ok')),
      ),
    ).toBeNull();
  });

  it('names the characters an update would pass, counting the digest and what it inserts', async () => {
    const db = await room();
    digest(db, 8);
    const caps = { characters: 10, stateBytes: 1_000_000 };
    expect(
      await liveTabLimitOf(
        db.env,
        TEXT_DOCUMENT_LIVE_TAB,
        't1',
        TextDocumentState.fromBody(Body.of('ab')),
        caps,
      ),
    ).toBeNull();
    expect(
      await liveTabLimitOf(
        db.env,
        TEXT_DOCUMENT_LIVE_TAB,
        't1',
        TextDocumentState.fromBody(Body.of('abc')),
        caps,
      ),
    ).toBe('characters');
    // An update that inserts nothing (a deletion, a format) is never refused for characters.
    expect(
      await liveTabLimitOf(db.env, TEXT_DOCUMENT_LIVE_TAB, 't1', TextDocumentState.seed(), {
        ...caps,
        characters: 0,
      }),
    ).toBeNull();
  });

  it('names the state an update would take past its size', async () => {
    const db = await room();
    const stored = TextDocumentState.fromBody(Body.of('stored'));
    await appendLiveTabUpdate(db.env, TEXT_DOCUMENT_LIVE_TAB, 't1', stored);
    const update = TextDocumentState.fromBody(Body.of('x'));
    const caps = { characters: 1_000, stateBytes: stored.byteLength + update.byteLength };
    expect(await liveTabLimitOf(db.env, TEXT_DOCUMENT_LIVE_TAB, 't1', update, caps)).toBeNull();
    expect(
      await liveTabLimitOf(db.env, TEXT_DOCUMENT_LIVE_TAB, 't1', update, {
        ...caps,
        stateBytes: caps.stateBytes - 1,
      }),
    ).toBe('state');
  });
});
