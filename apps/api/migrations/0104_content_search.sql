-- Content search (docs/specs/013-workspace/content-search.md, docs/specs/013-workspace/content-search.md):
-- one row per tab's search text, and one per document for its
-- cards under the tab key '~items'. Written only by each document's room, through its outbox; read only through the
-- access-filtered search. `text` keeps the text as written, for the snippet; `folded` keeps it folded as names are
-- (foldSearchText), for the share-of-trigrams check and word starts.
CREATE TABLE content_search (
  rowid       INTEGER PRIMARY KEY,
  document_id TEXT    NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  tab_id      TEXT    NOT NULL,
  tab_name    TEXT    NOT NULL,
  text        TEXT    NOT NULL,
  folded      TEXT    NOT NULL,
  UNIQUE (document_id, tab_id)
);

-- The trigram index over `text`, accents folded. External content: the text lives once, in content_search, and these
-- triggers keep the index in step (SQLite's documented pattern). D1 export refuses a database holding a virtual table:
-- drop this table and its triggers before an export and rebuild them after
-- (INSERT INTO content_search_fts (content_search_fts) VALUES ('rebuild')).
CREATE VIRTUAL TABLE content_search_fts USING fts5(
  text,
  content = 'content_search',
  content_rowid = 'rowid',
  tokenize = 'trigram remove_diacritics 1'
);

CREATE TRIGGER content_search_ai AFTER INSERT ON content_search BEGIN
  INSERT INTO content_search_fts (rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER content_search_ad AFTER DELETE ON content_search BEGIN
  INSERT INTO content_search_fts (content_search_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;
CREATE TRIGGER content_search_au AFTER UPDATE OF text ON content_search BEGIN
  INSERT INTO content_search_fts (content_search_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO content_search_fts (rowid, text) VALUES (new.rowid, new.text);
END;
