-- A custom stamp that shows who and when (docs/specs/035-pdf-documents/custom-stamps.md "Making one"): 1 where its
-- marks carry a dynamic stamp's lines under its picture; 0 for every stamp made before, as they were.
ALTER TABLE custom_stamps ADD COLUMN dynamic INTEGER NOT NULL DEFAULT 0;
