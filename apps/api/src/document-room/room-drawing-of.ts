// Which text document tab a drawing tab belongs to, as the room's own SQLite holds it, for the realtime half of a
// link to one tab (docs/specs/013-workspace/tab-scoped-share-links.md "Drawing tabs"). One reader per frame or
// message: each tab is read once however many scoped sockets ask. No store (a room not moved yet) knows no drawing;
// a failed read admits nothing, logged.
import type { DrawingOf } from '../room-scope';
import type { DocumentSql } from './document-db';

export function storedDrawingOf(sql: DocumentSql | null): DrawingOf {
  if (sql === null) return () => null;
  const read = new Map<string, string | null>();
  return (tabId) => {
    const known = read.get(tabId);
    if (known !== undefined) return known;
    let drawingOf: string | null = null;
    try {
      const row = sql.exec('SELECT drawing_of FROM tabs WHERE id = ?', tabId).toArray()[0];
      drawingOf = typeof row?.drawing_of === 'string' ? row.drawing_of : null;
    } catch (error) {
      console.warn('[room-scope] drawing read failed', { tabId, error: String(error) });
    }
    read.set(tabId, drawingOf);
    return drawingOf;
  };
}
