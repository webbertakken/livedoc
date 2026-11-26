-- What a collaboration index row hangs off (docs/specs/013-workspace/inbox.md §2.7): `element` for a canvas element's
-- action or thread, `text` for a text document's thread or assigned comment, kept in its live state. Every row written
-- before this is an element's.
ALTER TABLE collab_threads ADD COLUMN anchor TEXT NOT NULL DEFAULT 'element';
ALTER TABLE collab_actions ADD COLUMN anchor TEXT NOT NULL DEFAULT 'element';
