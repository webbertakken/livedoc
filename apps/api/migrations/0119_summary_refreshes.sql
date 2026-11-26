-- The one-off refresh of every document's content summary (docs/specs/006-document/document-storage.md "Refreshing
-- the summaries"): one row per document, written by its sweep, read by the operator's script. Flags only, never
-- content: whether the room's summary differs from D1's, and whether it would gain `textDocument`. `written_at` says
-- the run wrote (or found nothing to write); `error` names a failed try, which the sweep repeats at most once an hour.
CREATE TABLE summary_refreshes (
  document_id          TEXT    PRIMARY KEY REFERENCES documents (id) ON DELETE CASCADE,
  changed              INTEGER NOT NULL DEFAULT 0,
  gains_text_document  INTEGER NOT NULL DEFAULT 0,
  checked_at           INTEGER NOT NULL,
  written_at           INTEGER,
  error                TEXT
);
-- The sweep's read: documents not written yet, or a failed try due again.
CREATE INDEX summary_refreshes_due ON summary_refreshes (written_at, checked_at);
