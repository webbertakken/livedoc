-- Each document's move of its content from D1 into its room (docs/specs/006-document/document-storage-move.md,
--): written by the room after each try, read by the sweep and the operator's
-- tool. Ids, counts, hashes and error names only, never content. `born` marks a document created or copied in a
-- room, which D1 never held content for.
CREATE TABLE content_moves (
  document_id TEXT    PRIMARY KEY REFERENCES documents (id) ON DELETE CASCADE,
  status      TEXT    NOT NULL CHECK (status IN ('moved', 'failed', 'mismatch')),
  born        INTEGER NOT NULL DEFAULT 0,
  d1_tabs     INTEGER,
  room_tabs   INTEGER,
  d1_hash     TEXT,
  room_hash   TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  tried_at    INTEGER NOT NULL,
  moved_at    INTEGER,
  error       TEXT
);
-- The sweep's read: documents with no record or a record due a retry.
CREATE INDEX content_moves_due ON content_moves (status, tried_at);
