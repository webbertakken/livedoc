-- A worker issue stored for the refile (docs/specs/016-platform/worker-issues.md "Filing, storing and holding"): the
-- issue as JSON beside the report's columns, its `reporter_kind` `workers-issues` and no `owner_id`. NULL for a
-- person's report.
ALTER TABLE bug_reports ADD COLUMN issue TEXT;
