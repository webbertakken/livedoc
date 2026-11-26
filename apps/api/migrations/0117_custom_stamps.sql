-- Custom stamps (docs/specs/035-pdf-documents/custom-stamps.md "Where they are kept"): a person's own stamps,
-- owner-scoped as custom themes are, guests included. Its picture is a blob the owner holds (`blobs`), held by the
-- custom stamp while it is kept. Newest first.
CREATE TABLE custom_stamps (
  id             TEXT    PRIMARY KEY,
  owner_id       TEXT    NOT NULL,
  name           TEXT    NOT NULL,
  category       TEXT    NOT NULL,
  picture_key    TEXT    NOT NULL,
  picture_type   TEXT    NOT NULL,
  width          INTEGER NOT NULL,
  height         INTEGER NOT NULL,
  natural_width  REAL    NOT NULL,
  natural_height REAL    NOT NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX custom_stamps_owner_created ON custom_stamps (owner_id, created_at DESC);
CREATE INDEX custom_stamps_picture ON custom_stamps (owner_id, picture_key);
