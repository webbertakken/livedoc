// A live tab kind's schema step (docs/specs/006-document/kinds-outside-the-canvas.md "Live state"): its updates log, its
// chunks and its digest, each row under the room's row cap and going with its tab, and the outbox triggers that queue
// the tab's drain on every stored update and the document's summary on every digest. A kind appends the step this
// builds to the room's schema; the text document's own steps predate it and stay as they shipped.
import { outboxTrigger } from '../document-room/outbox-trigger';
import type { LiveTabTables } from './live-tab-kind';

export function liveTabSchemaStep({ updates, chunks, digest }: LiveTabTables): string {
  return `
CREATE TABLE IF NOT EXISTS ${updates} (
  tab_id TEXT    NOT NULL REFERENCES tabs (id) ON DELETE CASCADE,
  seq    INTEGER NOT NULL,
  bytes  BLOB    NOT NULL,
  PRIMARY KEY (tab_id, seq)
);

CREATE TABLE IF NOT EXISTS ${chunks} (
  tab_id TEXT    NOT NULL REFERENCES tabs (id) ON DELETE CASCADE,
  idx    INTEGER NOT NULL,
  rev    INTEGER NOT NULL,
  bytes  BLOB    NOT NULL,
  PRIMARY KEY (tab_id, idx)
);

CREATE TABLE IF NOT EXISTS ${digest} (
  tab_id      TEXT    PRIMARY KEY REFERENCES tabs (id) ON DELETE CASCADE,
  characters  INTEGER NOT NULL,
  words       INTEGER NOT NULL,
  pages       INTEGER NOT NULL,
  has_content INTEGER NOT NULL,
  state_bytes INTEGER NOT NULL,
  written_at  INTEGER NOT NULL
);
${outboxTrigger(
  `outbox_${updates}`,
  `AFTER INSERT ON ${updates}`,
  "SELECT document_id, 'tab', NEW.tab_id FROM document_tabs WHERE tab_id = NEW.tab_id",
)}
${outboxTrigger(
  `outbox_${digest}_insert`,
  `AFTER INSERT ON ${digest}`,
  "SELECT document_id, 'summary', '' FROM document_tabs WHERE tab_id = NEW.tab_id",
)}
${outboxTrigger(
  `outbox_${digest}_update`,
  `AFTER UPDATE ON ${digest}`,
  "SELECT document_id, 'summary', '' FROM document_tabs WHERE tab_id = NEW.tab_id",
)}
`;
}
