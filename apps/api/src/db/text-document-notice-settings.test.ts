import { describe, expect, it } from 'vitest';
import { sqliteD1 } from '../test-sqlite-d1';
import {
  noticeSettingsOf,
  readNoticeSetting,
  writeNoticeSetting,
} from './text-document-notice-settings';

// docs/specs/034-text-documents/review.md "Notifications" (The setting): per document, per person, on the server.

const T0 = 1_700_000_000_000;

function withDocument(id = 'd1') {
  const db = sqliteD1();
  db.sql
    .prepare(
      'INSERT INTO documents (id, owner_id, name, saved_at, created_at, shareable) VALUES (?, ?, ?, ?, ?, 0)',
    )
    .run(id, 'owner', 'Plan', T0, T0);
  return db;
}

describe('text document notice settings', () => {
  it('reads the defaults for a person with no setting', async () => {
    const { env } = withDocument();
    expect(await readNoticeSetting(env, 'd1', 'u1')).toEqual({
      comments: 'for-you',
      edits: 'none',
    });
  });

  it('keeps a written setting, and a second write replaces it', async () => {
    const { env } = withDocument();
    await writeNoticeSetting(env, 'd1', 'u1', { comments: 'all', edits: 'added-or-removed' }, T0);
    await writeNoticeSetting(
      env,
      'd1',
      'u1',
      { comments: 'none', edits: 'added-or-removed' },
      T0 + 1,
    );
    expect(await readNoticeSetting(env, 'd1', 'u1')).toEqual({
      comments: 'none',
      edits: 'added-or-removed',
    });
    expect(await readNoticeSetting(env, 'd1', 'u2')).toEqual({
      comments: 'for-you',
      edits: 'none',
    });
  });

  it('lists a document’s settings, by person', async () => {
    const { env } = withDocument();
    await writeNoticeSetting(env, 'd1', 'u2', { comments: 'all', edits: 'none' }, T0);
    await writeNoticeSetting(env, 'd1', 'u1', { comments: 'none', edits: 'added-or-removed' }, T0);
    expect(await noticeSettingsOf(env, 'd1')).toEqual([
      { ownerId: 'u1', comments: 'none', edits: 'added-or-removed' },
      { ownerId: 'u2', comments: 'all', edits: 'none' },
    ]);
  });

  it('goes with its document', async () => {
    const { env, sql } = withDocument();
    await writeNoticeSetting(env, 'd1', 'u1', { comments: 'all', edits: 'none' }, T0);
    sql.prepare('DELETE FROM documents WHERE id = ?').run('d1');
    expect(await noticeSettingsOf(env, 'd1')).toEqual([]);
  });

  it('reads a row the schema would refuse as the defaults', async () => {
    const { env, sql } = withDocument();
    sql.exec('PRAGMA ignore_check_constraints = ON');
    sql
      .prepare("INSERT INTO text_document_notice_settings VALUES ('d1', 'u1', 'weekly', 'none', 1)")
      .run();
    expect(await readNoticeSetting(env, 'd1', 'u1')).toEqual({
      comments: 'for-you',
      edits: 'none',
    });
    expect(await noticeSettingsOf(env, 'd1')).toEqual([]);
  });
});
