// The room's outbox triggers (docs/specs/006-document/document-storage.md "What the room holds"): a write queues the
// rows its trigger selects for the outbox's drain, each (document_id, kind, key) once.

/** A trigger that re-keys every (document_id, kind, key) row `keys` selects. */
export function outboxTrigger(name: string, on: string, keys: string): string {
  return `CREATE TRIGGER IF NOT EXISTS ${name} ${on}
BEGIN
  DELETE FROM outbox WHERE (document_id, kind, key) IN (${keys});
  INSERT INTO outbox (document_id, kind, key) ${keys};
END;`;
}
