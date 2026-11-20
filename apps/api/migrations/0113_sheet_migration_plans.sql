-- What each document's stored Plan Sheets would become (docs/specs/029-sheets/migration.md "How it runs"): one row
-- per document from the Sheets migration's dry run, written by its sweep, read by the operator's script. Counts and
-- the plan's kind only, never content; `error` names a failed try, which the sweep repeats at most once an hour.
CREATE TABLE sheet_migration_plans (
  document_id   TEXT    PRIMARY KEY REFERENCES documents (id) ON DELETE CASCADE,
  kind          TEXT    NOT NULL CHECK (kind IN ('none', 'in-place', 'split', 'failed')),
  tabs          INTEGER NOT NULL DEFAULT 0,
  sheets        INTEGER NOT NULL DEFAULT 0,
  cells         INTEGER NOT NULL DEFAULT 0,
  card_tables   INTEGER NOT NULL DEFAULT 0,
  charts        INTEGER NOT NULL DEFAULT 0,
  tabs_removed  INTEGER NOT NULL DEFAULT 0,
  sheets_left   INTEGER NOT NULL DEFAULT 0,
  planned_at    INTEGER NOT NULL,
  error         TEXT
);
-- The sweep's read: documents not planned yet, or a failed try due again.
CREATE INDEX sheet_migration_plans_due ON sheet_migration_plans (kind, planned_at);
