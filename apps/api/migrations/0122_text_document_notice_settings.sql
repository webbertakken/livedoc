-- A text document's notification setting per person (docs/specs/034-text-documents/review.md "Notifications"): what
-- one account hears of one document by email, as Google Docs' Tools > Notification settings. A person with no row has
-- the defaults (comments for you, no edits). Choices only, never content; a document's rows go with it, and an
-- account's with the account (db/account.ts).
CREATE TABLE text_document_notice_settings (
  document_id  TEXT    NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  owner_id     TEXT    NOT NULL,
  comments     TEXT    NOT NULL CHECK (comments IN ('all', 'for-you', 'none')),
  edits        TEXT    NOT NULL CHECK (edits IN ('added-or-removed', 'none')),
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (document_id, owner_id)
);
