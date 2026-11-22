-- The blob store (docs/specs/006-document/blob-store.md).

-- What an owner holds ("Where the bytes live"): per owner and key, the size, the object in the FILES bucket and when
-- it was stored. A row is written before the first byte, as a claim, and is held only once `stored_at` is set. The
-- object is named when the row is made and never renamed, so a guest who signs up takes rows with them, not bytes.
CREATE TABLE blobs (
  owner_id   TEXT    NOT NULL,
  key        TEXT    NOT NULL,
  size       INTEGER NOT NULL,
  object     TEXT    NOT NULL,
  claimed_at INTEGER NOT NULL,
  stored_at  INTEGER,
  PRIMARY KEY (owner_id, key)
) WITHOUT ROWID;
CREATE INDEX blobs_object ON blobs (object);
CREATE INDEX blobs_stored ON blobs (stored_at);

-- An upload in parts that is not finished ("Getting bytes in"): object storage's own upload, and the parts it has,
-- by number, each with the tag storage gave it. One per owner, key and size, so beginning again resumes it.
CREATE TABLE blob_uploads (
  id        TEXT    PRIMARY KEY,
  owner_id  TEXT    NOT NULL,
  key       TEXT    NOT NULL,
  size      INTEGER NOT NULL,
  r2_upload TEXT    NOT NULL,
  parts     TEXT    NOT NULL DEFAULT '{}',
  begun_at  INTEGER NOT NULL,
  UNIQUE (owner_id, key, size)
);
CREATE INDEX blob_uploads_begun ON blob_uploads (begun_at);

-- The keys each document's tabs hold ("Holds and retention"), pushed by the document's room: what the retention
-- sweep reads. `until` is null while the tab names the key, else the day a previous version's hold ends.
CREATE TABLE document_blobs (
  document_id TEXT    NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  tab_id      TEXT    NOT NULL,
  key         TEXT    NOT NULL,
  until       INTEGER,
  PRIMARY KEY (document_id, tab_id, key)
) WITHOUT ROWID;
CREATE INDEX document_blobs_key ON document_blobs (key);
