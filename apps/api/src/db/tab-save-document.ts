// What a tab save needs of its document (docs/specs/015-api/api.md "Tab save"), in one query. The save ran the
// full getDocument (the row with its share-code subquery, then the owner's participant and
// the tab summaries) and used eight fields of it, two sequential round trips before anything else on every
// autosave (~600 ms while someone edits). Live documents only, like every document read.

import type { DocumentDTO, DocumentEnv } from '../types';

export type TabSaveDocument = Pick<
  DocumentDTO,
  'id' | 'ownerId' | 'teamId' | 'name' | 'createdAt' | 'ownerName' | 'ownerColor'
> & {
  // How many tabs the document holds: where a new tab lands.
  tabCount: number;
  // Whether it is a spreadsheet (it has a workbook row), which holds only sheet tabs
  // (docs/specs/029-sheets/spreadsheet.md "The workbook shape").
  spreadsheet: boolean;
};

type Row = {
  id: string;
  owner_id: string;
  team_id: string | null;
  name: string;
  created_at: number;
  owner_name: string | null;
  owner_color: string | null;
};

// The listing's half from D1 and the tab count from the room's own SQLite, read together.
export async function getDocumentForSave(
  env: DocumentEnv,
  id: string,
): Promise<TabSaveDocument | null> {
  const [row, tabs] = await Promise.all([
    env.DB.prepare(
      `SELECT d.id, d.owner_id, d.team_id, d.name, d.created_at,
              p.name AS owner_name, p.color AS owner_color
         FROM documents d
         LEFT JOIN participants p ON p.id = d.owner_id
        WHERE d.id = ? AND d.trashed_at IS NULL`,
    )
      .bind(id)
      .first<Row>(),
    env.DOCUMENT_DB.prepare(
      `SELECT COUNT(*) AS n, EXISTS (SELECT 1 FROM workbook WHERE document_id = ?1) AS spreadsheet
         FROM document_tabs WHERE document_id = ?1`,
    )
      .bind(id)
      .first<{ n: number; spreadsheet: number }>(),
  ]);
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    teamId: row.team_id ?? null,
    name: row.name,
    createdAt: row.created_at,
    ownerName: row.owner_name ?? null,
    ownerColor: row.owner_color ?? null,
    tabCount: tabs?.n ?? 0,
    spreadsheet: tabs?.spreadsheet === 1,
  };
}
