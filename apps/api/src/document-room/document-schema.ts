// A room's own schema (docs/specs/006-document/document-storage.md "What the room holds",
// docs/specs/006-document/document-storage.md): everything one document holds as content, in its
// Durable Object's SQLite. D1 keeps the listing and the indexes the room's outbox feeds.
//
// One database per document, so `document_id` names the same document on every row. It stays a column (and in the
// keys) because the content modules were written for a store holding many documents, and keeping their SQL keyed by
// document is what lets them run unchanged.
//
// Made on first write, never on construction (document-db.ts `ensureSchema`): a room a stray id wakes stores
// nothing. Versioned by `_document_schema`; a change appends a step and never edits one that has shipped.

import { liveTabSchemaStep } from '../live-tabs/live-tab-schema';
import { PDF_LIVE_TAB } from '../pdf-documents/pdf-live-tab';
import { PDF_PREVIOUS_STEP } from '../pdf-documents/pdf-previous';
import { outboxTrigger } from './outbox-trigger';

const STEP_1 = `
CREATE TABLE IF NOT EXISTS document (
  id             TEXT    PRIMARY KEY,
  -- The slide deck (docs/specs/012-collaboration/presentation-mode.md), serialised, or null for none.
  presentation   TEXT    NULL,
  -- The item type catalogue (docs/specs/026-plan/item-types.md), JSON, or null for the default types.
  item_types     TEXT    NULL,
  item_types_rev INTEGER NOT NULL DEFAULT 0,
  items_rev      INTEGER NOT NULL DEFAULT 0,
  items_next_key INTEGER NOT NULL DEFAULT 1,
  saved_at       INTEGER NOT NULL,
  created_at     INTEGER NOT NULL
);

-- One row per tab: its body as JSON, capped at MAX_TAB_BYTES (the row cap of a Durable Object's SQLite).
CREATE TABLE IF NOT EXISTS tabs (
  id            TEXT    PRIMARY KEY,
  name          TEXT    NOT NULL,
  data          TEXT    NOT NULL,
  updated_at    INTEGER NOT NULL,
  element_count INTEGER NULL,
  rev           INTEGER NOT NULL DEFAULT 0
);
CREATE TRIGGER IF NOT EXISTS tabs_rev_advances BEFORE UPDATE OF data ON tabs
  WHEN NEW.rev IS NOT OLD.rev + 1
  BEGIN SELECT RAISE(ABORT, 'tab_rev_stale'); END;

CREATE TABLE IF NOT EXISTS document_tabs (
  document_id TEXT    NOT NULL,
  tab_id      TEXT    NOT NULL,
  order_index INTEGER NOT NULL,
  added_at    INTEGER NOT NULL,
  folder      TEXT,
  PRIMARY KEY (document_id, tab_id),
  FOREIGN KEY (document_id) REFERENCES document (id) ON DELETE CASCADE,
  FOREIGN KEY (tab_id) REFERENCES tabs (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS document_tabs_by_document ON document_tabs (document_id, order_index);
CREATE INDEX IF NOT EXISTS document_tabs_by_tab ON document_tabs (tab_id);

CREATE TABLE IF NOT EXISTS tab_stats (
  tab_id        TEXT    PRIMARY KEY REFERENCES tabs (id) ON DELETE CASCADE,
  mode          TEXT    NOT NULL,
  element_count INTEGER NOT NULL,
  comment_count INTEGER NOT NULL,
  data_bytes    INTEGER NOT NULL,
  written_at    INTEGER NOT NULL
);

-- Which gallery images each tab places (docs/specs/009-elements/images.md "Reference index"), written in the
-- transaction of the body it projects. A room never rebuilds tabs, so the cascade D1 could not have is safe here.
CREATE TABLE IF NOT EXISTS image_refs (
  tab_id   TEXT NOT NULL REFERENCES tabs (id) ON DELETE CASCADE,
  image_id TEXT NOT NULL,
  PRIMARY KEY (tab_id, image_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS image_refs_image_idx ON image_refs (image_id);

CREATE TABLE IF NOT EXISTS agent_changesets (
  id           TEXT    PRIMARY KEY,
  document_id  TEXT    NOT NULL REFERENCES document (id) ON DELETE CASCADE,
  tab_id       TEXT    NOT NULL REFERENCES tabs (id) ON DELETE CASCADE,
  rev          INTEGER NOT NULL,
  base_rev     INTEGER,
  author_id    TEXT    NOT NULL,
  author_name  TEXT    NOT NULL,
  author_color TEXT    NOT NULL,
  token_id     TEXT,
  summary      TEXT,
  fingerprints TEXT    NOT NULL,
  added        INTEGER NOT NULL,
  changed      INTEGER NOT NULL,
  removed      INTEGER NOT NULL,
  created_tab  INTEGER NOT NULL DEFAULT 0,
  revert_of    TEXT,
  created_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_changesets_tab_rev ON agent_changesets (tab_id, rev);
CREATE INDEX IF NOT EXISTS agent_changesets_document_created ON agent_changesets (document_id, created_at);
CREATE INDEX IF NOT EXISTS agent_changesets_created ON agent_changesets (created_at);
CREATE INDEX IF NOT EXISTS agent_changesets_author_idx ON agent_changesets (author_id);

CREATE TABLE IF NOT EXISTS agent_changeset_parts (
  changeset_id TEXT NOT NULL REFERENCES agent_changesets (id) ON DELETE CASCADE,
  part         TEXT NOT NULL CHECK (part IN ('ops', 'inverse', 'results')),
  data         TEXT NOT NULL,
  PRIMARY KEY (changeset_id, part)
);

CREATE TABLE IF NOT EXISTS items (
  document_id TEXT    NOT NULL REFERENCES document (id) ON DELETE CASCADE,
  id          TEXT    NOT NULL,
  type        TEXT    NOT NULL,
  item_key    INTEGER NOT NULL,
  rank        TEXT    NOT NULL,
  fields      TEXT    NOT NULL,
  rev         INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  created_by  TEXT    NOT NULL,
  updated_by  TEXT    NOT NULL,
  PRIMARY KEY (document_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS items_document_key ON items (document_id, item_key);
CREATE INDEX IF NOT EXISTS items_assignee ON items (json_extract(fields, '$.assignee.id'));
CREATE INDEX IF NOT EXISTS items_open_threads ON items (document_id)
  WHERE json_extract(fields, '$.comments.resolved') = 0;

CREATE TABLE IF NOT EXISTS plan_board_statuses (
  tab_id      TEXT    NOT NULL REFERENCES tabs (id) ON DELETE CASCADE,
  element_id  TEXT    NOT NULL,
  board_title TEXT    NOT NULL,
  status      TEXT    NOT NULL,
  done        INTEGER NOT NULL,
  board_order INTEGER NOT NULL,
  position    INTEGER NOT NULL,
  PRIMARY KEY (tab_id, status, element_id)
);

CREATE TABLE IF NOT EXISTS sheets (
  document_id              TEXT    NOT NULL REFERENCES document (id) ON DELETE CASCADE,
  id                       TEXT    NOT NULL,
  tab_id                   TEXT    NOT NULL,
  title                    TEXT    NOT NULL,
  layout                   TEXT    NOT NULL,
  rev                      INTEGER NOT NULL,
  cell_count               INTEGER NOT NULL DEFAULT 0,
  cell_bytes               INTEGER NOT NULL DEFAULT 0,
  unreferenced_since       INTEGER,
  write_nonce              TEXT,
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL,
  updated_by               TEXT    NOT NULL,
  delete_when_unreferenced INTEGER,
  PRIMARY KEY (document_id, id)
);
CREATE INDEX IF NOT EXISTS sheets_tab ON sheets (document_id, tab_id);
CREATE INDEX IF NOT EXISTS sheets_unreferenced ON sheets (unreferenced_since) WHERE unreferenced_since IS NOT NULL;

CREATE TABLE IF NOT EXISTS sheet_cells (
  document_id TEXT NOT NULL,
  sheet_id    TEXT NOT NULL,
  row_id      TEXT NOT NULL,
  col_id      TEXT NOT NULL,
  input       TEXT,
  format      TEXT,
  PRIMARY KEY (document_id, sheet_id, row_id, col_id),
  FOREIGN KEY (document_id, sheet_id) REFERENCES sheets (document_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sheet_refs (
  tab_id   TEXT NOT NULL REFERENCES tabs (id) ON DELETE CASCADE,
  sheet_id TEXT NOT NULL,
  PRIMARY KEY (tab_id, sheet_id)
);
CREATE INDEX IF NOT EXISTS sheet_refs_sheet ON sheet_refs (sheet_id);
CREATE TRIGGER IF NOT EXISTS sheet_refs_removed AFTER DELETE ON sheet_refs
BEGIN
  DELETE FROM sheets
   WHERE id = OLD.sheet_id
     AND delete_when_unreferenced = 1
     AND NOT EXISTS (SELECT 1 FROM sheet_refs r WHERE r.sheet_id = sheets.id);
  UPDATE sheets SET unreferenced_since = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
   WHERE id = OLD.sheet_id
     AND unreferenced_since IS NULL
     AND NOT EXISTS (SELECT 1 FROM sheet_refs r WHERE r.sheet_id = sheets.id);
END;
CREATE TRIGGER IF NOT EXISTS sheet_refs_added AFTER INSERT ON sheet_refs
BEGIN
  UPDATE sheets SET unreferenced_since = NULL
   WHERE id = NEW.sheet_id AND unreferenced_since IS NOT NULL;
END;
`;

// What the room owes D1 (document-outbox.ts): one key per changed thing, written by the
// triggers below in the transaction of the write it records (R3), so no write path can forget the listing. A key
// is re-keyed by DELETE then INSERT, so a key written again during a drain gets a new id and stays for the next one.
// `document_id` is the room's one document; it is a column so the content modules' store-of-many SQL runs unchanged.
//   summary ''      documents.content_summary and saved_at
//   tab     tab id  the tab's Inbox rows, its form links' heading, its search text; its links when it has gone
//   cards   ''      inbox_cards and the cards' threads
//   items   ''      the items' search text
//   images  ''      document_images and the placement grants
const OUTBOX = `
CREATE TABLE IF NOT EXISTS outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT    NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('summary', 'tab', 'cards', 'items', 'images')),
  key         TEXT    NOT NULL,
  UNIQUE (document_id, kind, key)
);
${outboxTrigger('outbox_document_insert', 'AFTER INSERT ON document', "SELECT NEW.id, 'summary', ''")}
${outboxTrigger('outbox_document_update', 'AFTER UPDATE ON document', "SELECT NEW.id, 'summary', ''")}
${outboxTrigger(
  'outbox_link_insert',
  'AFTER INSERT ON document_tabs',
  `SELECT NEW.document_id, 'tab', NEW.tab_id
   UNION ALL SELECT NEW.document_id, 'summary', ''
   UNION ALL SELECT NEW.document_id, 'images', ''`,
)}
${outboxTrigger(
  'outbox_link_delete',
  'AFTER DELETE ON document_tabs',
  `SELECT OLD.document_id, 'tab', OLD.tab_id
   UNION ALL SELECT OLD.document_id, 'summary', ''
   UNION ALL SELECT OLD.document_id, 'images', ''`,
)}
${outboxTrigger(
  'outbox_link_update',
  'AFTER UPDATE ON document_tabs',
  "SELECT NEW.document_id, 'summary', ''",
)}
${outboxTrigger(
  'outbox_tab_update',
  'AFTER UPDATE ON tabs',
  `SELECT document_id, 'tab', NEW.id FROM document_tabs WHERE tab_id = NEW.id
   UNION ALL SELECT document_id, 'summary', '' FROM document_tabs WHERE tab_id = NEW.id`,
)}
${outboxTrigger(
  'outbox_stats_insert',
  'AFTER INSERT ON tab_stats',
  "SELECT document_id, 'summary', '' FROM document_tabs WHERE tab_id = NEW.tab_id",
)}
${outboxTrigger(
  'outbox_stats_update',
  'AFTER UPDATE ON tab_stats',
  "SELECT document_id, 'summary', '' FROM document_tabs WHERE tab_id = NEW.tab_id",
)}
${outboxTrigger(
  'outbox_image_insert',
  'AFTER INSERT ON image_refs',
  "SELECT document_id, 'images', '' FROM document_tabs WHERE tab_id = NEW.tab_id",
)}
${outboxTrigger(
  'outbox_image_delete',
  'AFTER DELETE ON image_refs',
  "SELECT document_id, 'images', '' FROM document_tabs WHERE tab_id = OLD.tab_id",
)}
${outboxTrigger(
  'outbox_item_insert',
  'AFTER INSERT ON items',
  "SELECT NEW.document_id, 'cards', '' UNION ALL SELECT NEW.document_id, 'items', ''",
)}
${outboxTrigger(
  'outbox_item_update',
  'AFTER UPDATE ON items',
  "SELECT NEW.document_id, 'cards', '' UNION ALL SELECT NEW.document_id, 'items', ''",
)}
${outboxTrigger(
  'outbox_item_delete',
  'AFTER DELETE ON items',
  "SELECT OLD.document_id, 'cards', '' UNION ALL SELECT OLD.document_id, 'items', ''",
)}
${outboxTrigger(
  'outbox_board_insert',
  'AFTER INSERT ON plan_board_statuses',
  "SELECT document_id, 'cards', '' FROM document_tabs WHERE tab_id = NEW.tab_id",
)}
${outboxTrigger(
  'outbox_board_update',
  'AFTER UPDATE ON plan_board_statuses',
  "SELECT document_id, 'cards', '' FROM document_tabs WHERE tab_id = NEW.tab_id",
)}
${outboxTrigger(
  'outbox_board_delete',
  'AFTER DELETE ON plan_board_statuses',
  "SELECT document_id, 'cards', '' FROM document_tabs WHERE tab_id = OLD.tab_id",
)}
${outboxTrigger(
  'outbox_cell_insert',
  'AFTER INSERT ON sheet_cells',
  "SELECT document_id, 'tab', tab_id FROM sheets WHERE document_id = NEW.document_id AND id = NEW.sheet_id" +
    " UNION SELECT dt.document_id, 'tab', r.tab_id FROM sheet_refs r JOIN document_tabs dt ON dt.tab_id = r.tab_id" +
    ' WHERE r.sheet_id = NEW.sheet_id',
)}
${outboxTrigger(
  'outbox_cell_update',
  'AFTER UPDATE ON sheet_cells',
  "SELECT document_id, 'tab', tab_id FROM sheets WHERE document_id = NEW.document_id AND id = NEW.sheet_id" +
    " UNION SELECT dt.document_id, 'tab', r.tab_id FROM sheet_refs r JOIN document_tabs dt ON dt.tab_id = r.tab_id" +
    ' WHERE r.sheet_id = NEW.sheet_id',
)}
${outboxTrigger(
  'outbox_cell_delete',
  'AFTER DELETE ON sheet_cells',
  "SELECT document_id, 'tab', tab_id FROM sheets WHERE document_id = OLD.document_id AND id = OLD.sheet_id" +
    " UNION SELECT dt.document_id, 'tab', r.tab_id FROM sheet_refs r JOIN document_tabs dt ON dt.tab_id = r.tab_id" +
    ' WHERE r.sheet_id = OLD.sheet_id',
)}
`;

// A tab shared with other documents (tab-shares.ts, docs/specs/006-document/tab-document-many-to-many.md): every
// holder keeps its own copy under the same tab id. `tab_shares` lists the OTHER documents holding it; `share_outbox`
// is what this document still owes them, filled by the trigger below in the transaction of the write (R3):
//   body   the tab's current name and body, read when sent
//   join   `member` now holds the tab too
//   leave  this document no longer holds the tab
// A key written again is deleted and inserted under a new id, as in `outbox`, so a drain in flight keeps it.
// `share_state.receiving` is set while a copy taken from another holder is written, so taking it in queues no send
// back (receiveShares queues the holders the sender did not list itself).
const SHARES = `
CREATE TABLE IF NOT EXISTS tab_shares (
  tab_id      TEXT NOT NULL REFERENCES tabs (id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  PRIMARY KEY (tab_id, document_id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS share_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL CHECK (kind IN ('body', 'join', 'leave')),
  tab_id      TEXT    NOT NULL,
  to_document TEXT    NOT NULL,
  member      TEXT    NOT NULL DEFAULT '',
  UNIQUE (kind, tab_id, to_document, member)
);

CREATE TABLE IF NOT EXISTS share_state (receiving INTEGER NOT NULL);
INSERT INTO share_state (receiving) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM share_state);

CREATE TRIGGER IF NOT EXISTS share_on_write AFTER UPDATE OF name, data ON tabs
  WHEN EXISTS (SELECT 1 FROM tab_shares WHERE tab_id = NEW.id)
   AND COALESCE((SELECT receiving FROM share_state), 0) = 0
BEGIN
  DELETE FROM share_outbox WHERE kind = 'body' AND tab_id = NEW.id;
  INSERT INTO share_outbox (kind, tab_id, to_document)
    SELECT 'body', NEW.id, document_id FROM tab_shares WHERE tab_id = NEW.id;
END;
`;

// A text document's live state (docs/specs/034-text-documents/live-editing-and-storage.md "Storage"): the Yjs
// updates the room applied, appended as each arrives, and the chunks compaction folds them into, each row under the
// room's row cap. Both go with their tab.
const STEP_2 = `
CREATE TABLE IF NOT EXISTS text_document_updates (
  tab_id TEXT    NOT NULL REFERENCES tabs (id) ON DELETE CASCADE,
  seq    INTEGER NOT NULL,
  bytes  BLOB    NOT NULL,
  PRIMARY KEY (tab_id, seq)
);

CREATE TABLE IF NOT EXISTS text_document_chunks (
  tab_id TEXT    NOT NULL REFERENCES tabs (id) ON DELETE CASCADE,
  idx    INTEGER NOT NULL,
  rev    INTEGER NOT NULL,
  bytes  BLOB    NOT NULL,
  PRIMARY KEY (tab_id, idx)
);
`;

// A text document's digest (docs/specs/034-text-documents/live-editing-and-storage.md "The digest"): its counts and
// whether it has content, rebuilt from its state when the outbox drains the tab, which every stored update queues. Its
// search text is never kept here: it goes to D1 in the same drain, and a long text document's would pass the row cap.
const TEXT_DOCUMENT_DIGEST_STEP = `
CREATE TABLE IF NOT EXISTS text_document_digest (
  tab_id      TEXT    PRIMARY KEY REFERENCES tabs (id) ON DELETE CASCADE,
  characters  INTEGER NOT NULL,
  words       INTEGER NOT NULL,
  pages       INTEGER NOT NULL,
  has_content INTEGER NOT NULL,
  state_bytes INTEGER NOT NULL,
  written_at  INTEGER NOT NULL
);
${outboxTrigger(
  'outbox_text_document_update',
  'AFTER INSERT ON text_document_updates',
  "SELECT document_id, 'tab', NEW.tab_id FROM document_tabs WHERE tab_id = NEW.tab_id",
)}
${outboxTrigger(
  'outbox_text_document_digest_insert',
  'AFTER INSERT ON text_document_digest',
  "SELECT document_id, 'summary', '' FROM document_tabs WHERE tab_id = NEW.tab_id",
)}
${outboxTrigger(
  'outbox_text_document_digest_update',
  'AFTER UPDATE ON text_document_digest',
  "SELECT document_id, 'summary', '' FROM document_tabs WHERE tab_id = NEW.tab_id",
)}
`;

// The workbook row (docs/specs/029-sheets/sheet-store.md "In a spreadsheet"): one per spreadsheet, holding its file
// format and settings; a document holds one exactly when it is a spreadsheet, and its sheets are then referenced by
// their tabs (db/sheet-refs.ts).
const WORKBOOK_STEP = `
CREATE TABLE IF NOT EXISTS workbook (
  document_id TEXT    PRIMARY KEY REFERENCES document (id) ON DELETE CASCADE,
  format      TEXT    NOT NULL,
  settings    TEXT    NOT NULL,
  rev         INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
`;

// A spreadsheet's styles (db/sheet-styles.ts; docs/specs/029-sheets/sheet-store.md "In a spreadsheet"): each distinct
// format once, a cell holding its style's id. `format` is then empty at rest in a spreadsheet, so the index of cells
// holding one finds a write's fresh formats without reading the sheet.
const WORKBOOK_STYLES_STEP = `
CREATE TABLE IF NOT EXISTS sheet_styles (
  document_id TEXT NOT NULL REFERENCES document (id) ON DELETE CASCADE,
  id          TEXT NOT NULL,
  keys        TEXT NOT NULL,
  PRIMARY KEY (document_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS sheet_styles_keys ON sheet_styles (document_id, keys);
ALTER TABLE sheet_cells ADD COLUMN style_id TEXT;
CREATE INDEX IF NOT EXISTS sheet_cells_unstyled ON sheet_cells (document_id, sheet_id) WHERE format IS NOT NULL;
`;

// A sheet's row and column order in chunks (db/sheet-axes.ts; docs/specs/029-sheets/sheet-store.md "In a spreadsheet",
// Layout): every stored order moves out of its layout JSON into one chunk, as no sheet before this holds more than one
// chunk's ids.
const SHEET_AXES_STEP = `
CREATE TABLE IF NOT EXISTS sheet_axes (
  document_id TEXT    NOT NULL,
  sheet_id    TEXT    NOT NULL,
  axis        TEXT    NOT NULL CHECK (axis IN ('r', 'c')),
  chunk       INTEGER NOT NULL,
  ids         TEXT    NOT NULL,
  PRIMARY KEY (document_id, sheet_id, axis, chunk),
  FOREIGN KEY (document_id, sheet_id) REFERENCES sheets (document_id, id) ON DELETE CASCADE
);
INSERT OR IGNORE INTO sheet_axes (document_id, sheet_id, axis, chunk, ids)
  SELECT document_id, id, 'r', 0, json_extract(layout, '$.rows') FROM sheets
   WHERE json_valid(layout) AND json_type(layout, '$.rows') = 'array';
INSERT OR IGNORE INTO sheet_axes (document_id, sheet_id, axis, chunk, ids)
  SELECT document_id, id, 'c', 0, json_extract(layout, '$.cols') FROM sheets
   WHERE json_valid(layout) AND json_type(layout, '$.cols') = 'array';
UPDATE sheets SET layout = json_remove(layout, '$.rows', '$.cols') WHERE json_valid(layout);
`;

// Each tab row's kind (docs/specs/006-document/kinds-outside-the-canvas.md "The surface"), so a document's outline
// names it without reading a body. Every writer of a body writes it in the write itself, as it writes the element
// count (no trigger re-parses a body); the bodies stored before it are read once here. A body that is not JSON leaves
// the kind unknown.
const TAB_KIND_STEP = `
ALTER TABLE tabs ADD COLUMN kind TEXT;
UPDATE tabs SET kind = json_extract(data, '$.kind') WHERE json_valid(data);
`;

// Whether a spreadsheet's imports may fetch from the web (docs/specs/029-sheets/imports.md "Allow access"): an
// Editor's one-way choice; a copy's row is written without it, so a copy starts without it.
const WORKBOOK_IMPORTS_STEP = `
ALTER TABLE workbook ADD COLUMN imports_allowed INTEGER NOT NULL DEFAULT 0;
`;

// The spreadsheets a spreadsheet's IMPORTRANGEs may read (docs/specs/029-sheets/formulas.md "Connecting two
// spreadsheets"): a JSON array of document ids, added to by Editors, never taken back; a copy's row starts without.
const WORKBOOK_RANGE_SOURCES_STEP = `
ALTER TABLE workbook ADD COLUMN range_sources TEXT;
`;

// A spreadsheet's meaning (docs/specs/029-sheets/formulas.md, the file's meaning): 'ooxml' or 'openformula' for one
// opened from a file, kept by its copies; null for Google's, as every spreadsheet before it (D101).
const WORKBOOK_MEANING_STEP = `
ALTER TABLE workbook ADD COLUMN meaning TEXT;
`;

// A spreadsheet's kept content (db/workbook-kept.ts; docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Unknown
// content): the standard it is of and its bytes on the workbook row; its items and relationships in the file's order;
// its package entries by name, their bytes in chunks under the row cap (D114). A sheet's go with the sheet.
const WORKBOOK_KEPT_STEP = `
ALTER TABLE workbook ADD COLUMN kept_standard TEXT;
ALTER TABLE workbook ADD COLUMN kept_bytes INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS workbook_kept_items (
  document_id TEXT    NOT NULL REFERENCES document (id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  place       TEXT    NOT NULL,
  xml         TEXT    NOT NULL,
  ns          TEXT    NOT NULL,
  sheet_id    TEXT,
  row_id      TEXT,
  col_id      TEXT,
  PRIMARY KEY (document_id, seq),
  FOREIGN KEY (document_id, sheet_id) REFERENCES sheets (document_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS workbook_kept_relationships (
  document_id TEXT    NOT NULL REFERENCES document (id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  source      TEXT    NOT NULL CHECK (source IN ('package', 'workbook', 'sheet')),
  sheet_id    TEXT,
  rel_id      TEXT    NOT NULL,
  type        TEXT    NOT NULL,
  target      TEXT    NOT NULL,
  external    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (document_id, seq),
  FOREIGN KEY (document_id, sheet_id) REFERENCES sheets (document_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS workbook_kept_parts (
  document_id TEXT    NOT NULL REFERENCES document (id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  seq         INTEGER NOT NULL,
  type        TEXT    NOT NULL,
  rels        TEXT    NOT NULL,
  size        INTEGER NOT NULL,
  PRIMARY KEY (document_id, name)
);
CREATE TABLE IF NOT EXISTS workbook_kept_chunks (
  document_id TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  idx         INTEGER NOT NULL,
  bytes       BLOB    NOT NULL,
  PRIMARY KEY (document_id, name, idx),
  FOREIGN KEY (document_id, name) REFERENCES workbook_kept_parts (document_id, name) ON DELETE CASCADE
);
`;

// Each tab row's text document tab when it is a drawing tab (docs/specs/034-text-documents/objects.md "A drawing tab"),
// so a document's tab list leaves it out without reading a body. Written by every writer of a body, as the kind is;
// the bodies stored before it are read once here.
const TAB_DRAWING_OF_STEP = `
ALTER TABLE tabs ADD COLUMN drawing_of TEXT;
UPDATE tabs SET drawing_of = json_extract(data, '$.drawingOf') WHERE json_valid(data);
`;

// A sheet's changesets (docs/specs/024-agents/agent-changesets.md "A sheet's changesets", D265): one row each beside its
// sheet, going with it; its writes as they landed, their inverse and its after-image beside it, one row a part.
const SHEET_CHANGESETS_STEP = `
CREATE TABLE IF NOT EXISTS sheet_changesets (
  id           TEXT    PRIMARY KEY,
  document_id  TEXT    NOT NULL,
  sheet_id     TEXT    NOT NULL,
  tab_id       TEXT    NOT NULL,
  rev          INTEGER NOT NULL,
  previous_rev INTEGER NOT NULL,
  author_id    TEXT    NOT NULL,
  author_name  TEXT    NOT NULL,
  author_color TEXT    NOT NULL,
  token_id     TEXT,
  summary      TEXT,
  added        INTEGER NOT NULL,
  changed      INTEGER NOT NULL,
  removed      INTEGER NOT NULL,
  revert_of    TEXT,
  created_at   INTEGER NOT NULL,
  FOREIGN KEY (document_id, sheet_id) REFERENCES sheets (document_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sheet_changesets_document_created ON sheet_changesets (document_id, created_at);
CREATE INDEX IF NOT EXISTS sheet_changesets_created ON sheet_changesets (created_at);
CREATE TABLE IF NOT EXISTS sheet_changeset_parts (
  changeset_id TEXT NOT NULL REFERENCES sheet_changesets (id) ON DELETE CASCADE,
  part         TEXT NOT NULL CHECK (part IN ('writes', 'inverse', 'after')),
  data         TEXT NOT NULL,
  PRIMARY KEY (changeset_id, part)
);
`;

// A spreadsheet's named functions (docs/specs/029-sheets/formulas.md "Named functions"): a JSON array saved whole by
// Editors; null for none.
const WORKBOOK_FUNCTIONS_STEP = `
ALTER TABLE workbook ADD COLUMN functions TEXT;
`;

// A text document tab's versions (docs/specs/034-text-documents/live-editing-and-storage.md "Versions"): each its state
// vector and the deletions it adds over the version before it; who wrote with each Yjs client id; and the deletions
// each author made since the last version, which the next version takes. All go with their tab.
const TEXT_DOCUMENT_VERSIONS_STEP = `
CREATE TABLE IF NOT EXISTS text_document_versions (
  tab_id         TEXT    NOT NULL REFERENCES tabs (id) ON DELETE CASCADE,
  seq            INTEGER NOT NULL,
  id             TEXT    NOT NULL UNIQUE,
  kind           TEXT    NOT NULL,
  name           TEXT,
  taken_at       INTEGER NOT NULL,
  taken_by       TEXT,
  taken_by_name  TEXT,
  taken_by_color TEXT,
  restored_from  TEXT,
  state_vector   BLOB    NOT NULL,
  deletions      BLOB    NOT NULL,
  editors        TEXT    NOT NULL,
  deleted_by     TEXT    NOT NULL,
  bytes          INTEGER NOT NULL,
  PRIMARY KEY (tab_id, seq)
);

CREATE TABLE IF NOT EXISTS text_document_clients (
  tab_id   TEXT    NOT NULL REFERENCES tabs (id) ON DELETE CASCADE,
  client   INTEGER NOT NULL,
  author   TEXT    NOT NULL,
  name     TEXT,
  color    TEXT,
  first_at INTEGER NOT NULL,
  PRIMARY KEY (tab_id, client)
);

CREATE TABLE IF NOT EXISTS text_document_pending_deletions (
  tab_id    TEXT NOT NULL REFERENCES tabs (id) ON DELETE CASCADE,
  author    TEXT NOT NULL,
  deletions BLOB NOT NULL,
  PRIMARY KEY (tab_id, author)
);
`;

// A Viewer's copy of a text document tab (docs/specs/034-text-documents/live-editing-and-storage.md "A Viewer's copy"):
// which copy it is and the client that writes it, and the copy's own updates, compacted into one row. Both go with their
// tab, and with the room's last Viewer.
const TEXT_DOCUMENT_VIEWER_COPY_STEP = `
CREATE TABLE IF NOT EXISTS text_document_viewer_copies (
  tab_id  TEXT    PRIMARY KEY REFERENCES tabs (id) ON DELETE CASCADE,
  id      TEXT    NOT NULL,
  client  INTEGER NOT NULL,
  made_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS text_document_viewer_copy_updates (
  tab_id TEXT    NOT NULL REFERENCES tabs (id) ON DELETE CASCADE,
  seq    INTEGER NOT NULL,
  bytes  BLOB    NOT NULL,
  PRIMARY KEY (tab_id, seq)
);
`;

// A text document tab's last edit (docs/specs/034-text-documents/live-editing-and-storage.md "Who changed what"): when its
// newest update was stored and who sent it, one row a tab, going with it.
const TEXT_DOCUMENT_LAST_EDIT_STEP = `
CREATE TABLE IF NOT EXISTS text_document_last_edits (
  tab_id TEXT    PRIMARY KEY REFERENCES tabs (id) ON DELETE CASCADE,
  at     INTEGER NOT NULL,
  author TEXT,
  name   TEXT,
  color  TEXT
);
`;

// A text document tab's notification window (docs/specs/034-text-documents/review.md "Notifications", Batches): opened
// by the first update stored in it, holding what the tab read just before it: its comments' ids and its state (a
// state vector and deletions), and who deleted what while it is open, so the email sent when the window ends says
// only what is new and whose it is. Gone once sent.
const TEXT_DOCUMENT_NOTICE_STEP = `
CREATE TABLE IF NOT EXISTS text_document_notice_baselines (
  tab_id       TEXT    PRIMARY KEY REFERENCES tabs (id) ON DELETE CASCADE,
  since        INTEGER NOT NULL,
  comment_ids  TEXT    NOT NULL,
  state_vector BLOB    NOT NULL,
  deletions    BLOB    NOT NULL
);

CREATE TABLE IF NOT EXISTS text_document_notice_deletions (
  tab_id    TEXT NOT NULL REFERENCES tabs (id) ON DELETE CASCADE,
  author    TEXT NOT NULL,
  name      TEXT,
  deletions BLOB NOT NULL,
  PRIMARY KEY (tab_id, author)
);
`;

// A sheet's images over cells (docs/specs/009-elements/images.md "A sheet's references", D624): the gallery images its
// layout's objects of kind image place, kept by triggers on every insert of a sheet and every write of its layout, so
// no writer can leave them behind; they go with their sheet. `placed_images` reads them with the tabs' references by
// tab, and the outbox pushes the document's set when they change.
const SHEET_IMAGES_OF = (row: string) => `SELECT DISTINCT o.value ->> 'imageId' AS image_id
    FROM json_each(CASE WHEN json_valid(${row}.layout) THEN ${row}.layout ELSE '{}' END, '$.objects') o
   WHERE o.value ->> 'kind' = 'image'
     AND typeof(o.value ->> 'imageId') = 'text'
     AND length(o.value ->> 'imageId') BETWEEN 1 AND 128
     AND substr(o.value ->> 'imageId', 1, 5) <> 'data:'`;
const SHEET_IMAGE_REFS_STEP = `
CREATE TABLE IF NOT EXISTS sheet_image_refs (
  document_id TEXT NOT NULL,
  sheet_id    TEXT NOT NULL,
  image_id    TEXT NOT NULL,
  PRIMARY KEY (document_id, sheet_id, image_id),
  FOREIGN KEY (document_id, sheet_id) REFERENCES sheets (document_id, id) ON DELETE CASCADE
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS sheet_image_refs_image_idx ON sheet_image_refs (image_id);

CREATE VIEW IF NOT EXISTS placed_images AS
  SELECT tab_id, image_id FROM image_refs
  UNION ALL
  SELECT s.tab_id, r.image_id FROM sheet_image_refs r
    JOIN sheets s ON s.document_id = r.document_id AND s.id = r.sheet_id;

CREATE TRIGGER IF NOT EXISTS sheet_image_refs_on_insert AFTER INSERT ON sheets
BEGIN
  INSERT OR IGNORE INTO sheet_image_refs (document_id, sheet_id, image_id)
    SELECT NEW.document_id, NEW.id, image_id FROM (${SHEET_IMAGES_OF('NEW')});
END;

CREATE TRIGGER IF NOT EXISTS sheet_image_refs_on_layout AFTER UPDATE OF layout ON sheets
BEGIN
  DELETE FROM sheet_image_refs
   WHERE document_id = NEW.document_id AND sheet_id = NEW.id
     AND image_id NOT IN (${SHEET_IMAGES_OF('NEW')});
  INSERT OR IGNORE INTO sheet_image_refs (document_id, sheet_id, image_id)
    SELECT NEW.document_id, NEW.id, image_id FROM (${SHEET_IMAGES_OF('NEW')});
END;

${outboxTrigger(
  'outbox_sheet_image_insert',
  'AFTER INSERT ON sheet_image_refs',
  "SELECT NEW.document_id, 'images', ''",
)}
${outboxTrigger(
  'outbox_sheet_image_delete',
  'AFTER DELETE ON sheet_image_refs',
  "SELECT OLD.document_id, 'images', ''",
)}
`;

// A sheet's cells holding pictures (docs/specs/009-elements/images.md "A sheet's references", D633): each cell whose
// input is a gallery picture (`{"img":{"id":...}}`, inserted-objects.md "Images in a cell") is a row, kept by triggers
// on every insert, input write and delete of a cell, so no writer can leave one behind; they go with their sheet.
// `placed_images` reads them beside the layouts' images. The LIKE prefilter keeps the triggers off other cells' JSON.
const CELL_PICTURE_OF = (row: string) => `SELECT ${row}.input ->> '$.img.id' AS image_id
   WHERE json_valid(${row}.input)
     AND json_type(${row}.input, '$.img') = 'object'
     AND typeof(${row}.input ->> '$.img.id') = 'text'
     AND length(${row}.input ->> '$.img.id') BETWEEN 1 AND 128
     AND substr(${row}.input ->> '$.img.id', 1, 5) <> 'data:'`;
const CELL_PICTURE_LIKE = `'{"img":%'`;
// A cell's note (docs/specs/029-sheets/review.md "Notes"): plain text beside its input and format.
const SHEET_CELL_NOTES_STEP = `
ALTER TABLE sheet_cells ADD COLUMN note TEXT;
`;

const SHEET_CELL_IMAGE_REFS_STEP = `
CREATE TABLE IF NOT EXISTS sheet_cell_image_refs (
  document_id TEXT NOT NULL,
  sheet_id    TEXT NOT NULL,
  row_id      TEXT NOT NULL,
  col_id      TEXT NOT NULL,
  image_id    TEXT NOT NULL,
  PRIMARY KEY (document_id, sheet_id, row_id, col_id),
  FOREIGN KEY (document_id, sheet_id) REFERENCES sheets (document_id, id) ON DELETE CASCADE
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS sheet_cell_image_refs_image_idx ON sheet_cell_image_refs (image_id);

INSERT OR IGNORE INTO sheet_cell_image_refs (document_id, sheet_id, row_id, col_id, image_id)
  SELECT c.document_id, c.sheet_id, c.row_id, c.col_id, c.input ->> '$.img.id' FROM sheet_cells c
   WHERE c.input LIKE ${CELL_PICTURE_LIKE} AND EXISTS (${CELL_PICTURE_OF('c')});

DROP VIEW IF EXISTS placed_images;
CREATE VIEW placed_images AS
  SELECT tab_id, image_id FROM image_refs
  UNION ALL
  SELECT s.tab_id, r.image_id FROM sheet_image_refs r
    JOIN sheets s ON s.document_id = r.document_id AND s.id = r.sheet_id
  UNION ALL
  SELECT s.tab_id, r.image_id FROM sheet_cell_image_refs r
    JOIN sheets s ON s.document_id = r.document_id AND s.id = r.sheet_id;

CREATE TRIGGER IF NOT EXISTS sheet_cell_image_refs_on_insert AFTER INSERT ON sheet_cells
WHEN NEW.input LIKE ${CELL_PICTURE_LIKE}
BEGIN
  INSERT OR IGNORE INTO sheet_cell_image_refs (document_id, sheet_id, row_id, col_id, image_id)
    SELECT NEW.document_id, NEW.sheet_id, NEW.row_id, NEW.col_id, image_id FROM (${CELL_PICTURE_OF('NEW')});
END;

CREATE TRIGGER IF NOT EXISTS sheet_cell_image_refs_on_input AFTER UPDATE OF input ON sheet_cells
WHEN OLD.input LIKE ${CELL_PICTURE_LIKE} OR NEW.input LIKE ${CELL_PICTURE_LIKE}
BEGIN
  DELETE FROM sheet_cell_image_refs
   WHERE document_id = OLD.document_id AND sheet_id = OLD.sheet_id AND row_id = OLD.row_id AND col_id = OLD.col_id;
  INSERT OR IGNORE INTO sheet_cell_image_refs (document_id, sheet_id, row_id, col_id, image_id)
    SELECT NEW.document_id, NEW.sheet_id, NEW.row_id, NEW.col_id, image_id FROM (${CELL_PICTURE_OF('NEW')});
END;

CREATE TRIGGER IF NOT EXISTS sheet_cell_image_refs_on_delete AFTER DELETE ON sheet_cells
WHEN OLD.input LIKE ${CELL_PICTURE_LIKE}
BEGIN
  DELETE FROM sheet_cell_image_refs
   WHERE document_id = OLD.document_id AND sheet_id = OLD.sheet_id AND row_id = OLD.row_id AND col_id = OLD.col_id;
END;

${outboxTrigger(
  'outbox_sheet_cell_image_insert',
  'AFTER INSERT ON sheet_cell_image_refs',
  "SELECT NEW.document_id, 'images', ''",
)}
${outboxTrigger(
  'outbox_sheet_cell_image_delete',
  'AFTER DELETE ON sheet_cell_image_refs',
  "SELECT OLD.document_id, 'images', ''",
)}
`;

// A spreadsheet's comment threads (docs/specs/029-sheets/review.md "Comments"): each sheet's threads by id, beside its
// cells, anchored by row and column ids; their comments one JSON list. Their sheet's tab is pushed to the collaboration
// index when one changes, as a cell's change pushes it.
const SHEET_THREADS_STEP = `
CREATE TABLE IF NOT EXISTS sheet_threads (
  document_id TEXT NOT NULL,
  sheet_id    TEXT NOT NULL,
  id          TEXT NOT NULL,
  r1          TEXT NOT NULL,
  c1          TEXT NOT NULL,
  r2          TEXT NOT NULL,
  c2          TEXT NOT NULL,
  resolved    INTEGER NOT NULL DEFAULT 0,
  comments    TEXT NOT NULL,
  v           INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (document_id, sheet_id, id),
  FOREIGN KEY (document_id, sheet_id) REFERENCES sheets (document_id, id) ON DELETE CASCADE
);
${outboxTrigger(
  'outbox_sheet_thread_insert',
  'AFTER INSERT ON sheet_threads',
  "SELECT document_id, 'tab', tab_id FROM sheets WHERE document_id = NEW.document_id AND id = NEW.sheet_id",
)}
${outboxTrigger(
  'outbox_sheet_thread_update',
  'AFTER UPDATE ON sheet_threads',
  "SELECT document_id, 'tab', tab_id FROM sheets WHERE document_id = NEW.document_id AND id = NEW.sheet_id",
)}
${outboxTrigger(
  'outbox_sheet_thread_delete',
  'AFTER DELETE ON sheet_threads',
  "SELECT document_id, 'tab', tab_id FROM sheets WHERE document_id = OLD.document_id AND id = OLD.sheet_id",
)}
`;

/** Every step the room's schema has taken, in order; a change appends one and never edits a shipped step. */
export const DOCUMENT_SCHEMA_STEPS: readonly string[] = [
  STEP_1 + OUTBOX + SHARES,
  STEP_2,
  WORKBOOK_STEP,
  WORKBOOK_STYLES_STEP,
  SHEET_AXES_STEP,
  TEXT_DOCUMENT_DIGEST_STEP,
  TAB_KIND_STEP,
  WORKBOOK_IMPORTS_STEP,
  WORKBOOK_RANGE_SOURCES_STEP,
  WORKBOOK_MEANING_STEP,
  // A PDF document's live changes (docs/specs/035-pdf-documents/live-editing-and-storage.md "Storage").
  liveTabSchemaStep(PDF_LIVE_TAB.tables),
  // A PDF tab's previous versions ("Replacing the stored file").
  PDF_PREVIOUS_STEP,
  WORKBOOK_KEPT_STEP,
  TAB_DRAWING_OF_STEP,
  SHEET_CHANGESETS_STEP,
  WORKBOOK_FUNCTIONS_STEP,
  TEXT_DOCUMENT_VERSIONS_STEP,
  TEXT_DOCUMENT_VIEWER_COPY_STEP,
  TEXT_DOCUMENT_LAST_EDIT_STEP,
  TEXT_DOCUMENT_NOTICE_STEP,
  SHEET_IMAGE_REFS_STEP,
  SHEET_CELL_IMAGE_REFS_STEP,
  SHEET_CELL_NOTES_STEP,
  SHEET_THREADS_STEP,
];

export const DOCUMENT_SCHEMA_VERSION = DOCUMENT_SCHEMA_STEPS.length;

type Exec = (query: string) => { toArray(): Record<string, unknown>[] };

/** Bring a room's SQLite up to DOCUMENT_SCHEMA_VERSION. Idempotent; runs inside the caller's transaction. Answers
 * the version it found and the one it left. */
export function migrateDocumentSchema(exec: Exec): { from: number; to: number } {
  exec('CREATE TABLE IF NOT EXISTS _document_schema (version INTEGER NOT NULL)');
  const row = exec('SELECT version FROM _document_schema LIMIT 1').toArray()[0];
  const at = typeof row?.version === 'number' ? row.version : 0;
  if (at >= DOCUMENT_SCHEMA_STEPS.length) return { from: at, to: at };
  for (let step = at; step < DOCUMENT_SCHEMA_STEPS.length; step++)
    exec(DOCUMENT_SCHEMA_STEPS[step]!);
  exec('DELETE FROM _document_schema');
  exec(`INSERT INTO _document_schema (version) VALUES (${DOCUMENT_SCHEMA_STEPS.length})`);
  return { from: at, to: DOCUMENT_SCHEMA_STEPS.length };
}

/** Whether a room's SQLite holds a schema at all: a read that writes nothing. */
export function hasDocumentSchema(exec: Exec): boolean {
  return (
    exec("SELECT 1 AS present FROM sqlite_master WHERE name = '_document_schema'").toArray()
      .length > 0
  );
}
