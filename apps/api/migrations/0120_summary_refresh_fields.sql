-- What the content summaries' refresh would change (docs/specs/006-document/document-storage.md "Refreshing the
-- summaries", What changed): the fields that differ by name (a comma list), hasContent before (NULL unknown) and after,
-- the numeric differences (JSON of numbers), and a document the run skipped by name (`has_content_lost`). Never content.
ALTER TABLE summary_refreshes ADD COLUMN fields TEXT;
ALTER TABLE summary_refreshes ADD COLUMN has_content_before INTEGER;
ALTER TABLE summary_refreshes ADD COLUMN has_content_after INTEGER;
ALTER TABLE summary_refreshes ADD COLUMN deltas TEXT;
ALTER TABLE summary_refreshes ADD COLUMN skipped TEXT;
-- The pass that records them starts from an empty table (director, 2026-11-26).
DELETE FROM summary_refreshes;
