// Changing a sheet for an agent (docs/specs/029-sheets/sheet-store.md "Agents", MCP change_sheet and the CLI's sheet
// verbs): changes in order, each built against the sheet as the ones before it left it, then sent together as one
// sheet changeset (docs/specs/024-agents/agent-changesets.md "A sheet's changesets", D269): every change lands or
// none does, a large one split into the write route's parts inside it. A change is checked against the store's caps
// whole before anything is sent (writesCapsProblem); a refusal says nothing was written.
import { ApiError, type ApiClient } from '@livedoc/api-client';
import { IMAGES_UNAVAILABLE, notInGallery } from '../images/gallery';
import type { GalleryPicture } from './sheet-image-objects';
import {
  CLIENT_HEADER,
  type ChangesetRequest,
  type ImageSummary,
  type ChangesetResponse,
  type SheetWriteRequest,
  type SheetWriteResponse,
  type SheetChangesetRequest,
  type SheetChangesetResponse,
  type WorkbookSheetMoveRequest,
  type TabRecord,
  type TabResponse,
} from '@livedoc/api-schema';
import { tabPath } from '../verbs/shared';
import { sheetChartElements, type SheetChartOut } from './sheet-charts';
import {
  chartsCleared,
  chartsFollowing,
  type SheetChartEl,
  type SheetShape,
} from './sheet-chart-follow';
import { darkCanvas } from './sheet-design';
import {
  SheetLimits,
  applySheetWrite,
  documentCellCount,
  rowHeights,
  NOBODY,
  splitWrite,
  writesCapsProblem,
  type GridRange,
  type Rand,
  type Sheet,
  type SheetWrite,
  type Workbook,
} from '@livedoc/sheets';
import { apiRefusalOf } from '../plan/api-refusal';
import { SHEET_REFUSAL_WORDS } from './sheet-refusals';
import { buildSheetChange, type SheetChange, type SheetChangeContext } from './sheet-change-build';
import {
  readSheetsState,
  resolveSheet,
  sheetChangesetsPath,
  sheetWritesPath,
  workbookFor,
} from './sheet-state';
import { chartObjectSet, newChartId } from './sheet-chart-objects';

export const workbookSheetsPath = (documentId: string) =>
  `/documents/${encodeURIComponent(documentId)}/workbook/sheets`;

type Built = Extract<ReturnType<typeof buildSheetChange>, { ok: true }>;

// A built change's charts (a design's) as the spreadsheet sheet's own, their writes after the change's.
function withChartObjects(wb: Workbook, sheetId: string, built: Built, rand: Rand): Built {
  if (!built.charts?.length) return built;
  const writes = [...built.writes];
  const taken = new Set<string>();
  for (const out of built.charts) {
    const id = newChartId(wb.sheet(sheetId)!.layout, rand, taken);
    taken.add(id);
    writes.push(chartObjectSet(wb, sheetId, out, id));
  }
  return { ...built, writes, charts: [] };
}

interface SheetChangesResult {
  sheetId: string;
  title: string;
  applied: string[];
  rev: number | null;
  // The sheet changeset the call wrote, which `livedoc changeset revert` undoes; null when nothing changed.
  changesetId: string | null;
  refusal?: { code: string; message: string };
}

// What applying changes answers: the lines, the revision, the changeset, a refusal, and the charts they put over the
// cells.
type Applied = Omit<SheetChangesResult, 'sheetId' | 'title'> & {
  charts: SheetChartOut[];
  clear: (GridRange | null)[];
};

// One write through the api's write route, and the sheet after it as stored: a filling's (add_sheet,
// create_spreadsheet), not a change's.
export async function sendSheetWrite(
  api: ApiClient,
  documentId: string,
  sheet: Sheet,
  write: SheetWrite,
  client: 'mcp' | 'cli',
): Promise<Sheet> {
  const body: SheetWriteRequest = { write, wid: crypto.randomUUID() };
  const answer = await api.json<SheetWriteResponse>(sheetWritesPath(documentId, sheet.id), {
    method: 'POST',
    headers: { [CLIENT_HEADER]: client },
    body: JSON.stringify(body),
  });
  const landed = applySheetWrite(sheet, answer.applied, { now: Date.now(), by: NOBODY });
  return { ...landed.sheet, rev: answer.rev };
}

// A cap the whole change would cross, in the api's words, before anything is sent.
export function capsRefusal(
  sheet: Sheet,
  writes: readonly SheetWrite[],
  documentCells: number,
  limits: SheetLimits = SheetLimits.plan,
): { code: string; message: string } | null {
  const code = writesCapsProblem(sheet, writes, documentCells, limits);
  if (!code) return null;
  console.info('[sheets] agent change over a cap', { code });
  return {
    code,
    message: `This change would pass a limit, so none of it was written: ${SHEET_REFUSAL_WORDS[code]}`,
  };
}

// The writes as one sheet changeset (docs/specs/024-agents/agent-changesets.md "A sheet's changesets", D269): every one
// lands or none does.
async function sendSheetChangeset(
  api: ApiClient,
  documentId: string,
  sheetId: string,
  writes: readonly SheetWrite[],
  client: 'mcp' | 'cli',
): Promise<SheetChangesetResponse> {
  const body: SheetChangesetRequest = { writes: [...writes] };
  return api.json<SheetChangesetResponse>(sheetChangesetsPath(documentId, sheetId), {
    method: 'POST',
    headers: { [CLIENT_HEADER]: client },
    body: JSON.stringify(body),
  });
}

const NOTHING_WRITTEN = 'Nothing of this call was written.';

// Builds each change in turn against the workbook, which follows every change as built, then sends them all as one
// sheet changeset; a spreadsheet's moves follow it through the workbook's door. A refused change, or a refused
// changeset, writes nothing.
async function applySheetChanges(
  api: ApiClient,
  documentId: string,
  wb: Workbook,
  sheetId: string,
  changes: readonly SheetChange[],
  client: 'mcp' | 'cli',
  documentCells: number,
  rand: Rand = Math.random,
  context: SheetChangeContext = {},
): Promise<Applied> {
  const lines: string[] = [];
  const charts: SheetChartOut[] = [];
  const clear: (GridRange | null)[] = [];
  const writes: SheetWrite[] = [];
  const moves: string[] = [];
  const start = wb.sheet(sheetId)!;
  const refused = (refusal: { code: string; message: string }): Applied => {
    // The workbook is put back as stored, so what follows reads nothing of the refused call.
    wb.updateSheet(start);
    const message = `${refusal.message} ${NOTHING_WRITTEN}`;
    return {
      applied: [],
      rev: null,
      changesetId: null,
      charts: [],
      clear: [],
      refusal: { ...refusal, message },
    };
  };
  let cells = documentCells;
  for (const change of changes) {
    const sheet = wb.sheet(sheetId)!;
    const others = wb
      .sheetList()
      .filter((s) => s.id !== sheetId)
      .map((s) => s.title);
    const made = buildSheetChange(wb, sheetId, change, others, rand, context);
    if (!made.ok) return refused({ code: made.code, message: made.message });
    // A spreadsheet's design charts are the sheet's own, set with the design's writes (charts.md "The model").
    const built = context.spreadsheet ? withChartObjects(wb, sheetId, made, rand) : made;
    const over = capsRefusal(sheet, built.writes, cells, wb.limits);
    if (over) return refused(over);
    let next = sheet;
    for (const part of built.writes.flatMap((w) => splitWrite(w))) {
      next = applySheetWrite(next, part, { now: Date.now(), by: NOBODY }).sheet;
      writes.push(part);
    }
    cells += next.cells.size - sheet.cells.size;
    if (next !== sheet) wb.updateSheet(next);
    if (built.moveAfter !== undefined) moves.push(built.moveAfter ?? '');
    lines.push(built.line);
    charts.push(...(built.charts ?? []));
    if (built.clearCharts !== undefined) clear.push(built.clearCharts);
  }
  let rev: number | null = null;
  let changesetId: string | null = null;
  if (writes.length) {
    try {
      const answer = await sendSheetChangeset(api, documentId, sheetId, writes, client);
      rev = answer.rev;
      changesetId = answer.changeset?.id ?? null;
      wb.updateSheet({ ...wb.sheet(sheetId)!, rev: answer.rev });
    } catch (err) {
      const refusal = apiRefusalOf(err);
      if (!refusal) throw err;
      return refused(refusal);
    }
  }
  for (const after of moves) {
    try {
      await api.json(`${workbookSheetsPath(documentId)}/${encodeURIComponent(sheetId)}/move`, {
        method: 'POST',
        headers: { [CLIENT_HEADER]: client },
        body: JSON.stringify({ after } satisfies WorkbookSheetMoveRequest),
      });
    } catch (err) {
      const refusal = apiRefusalOf(err);
      if (!refusal) throw err;
      // The changeset landed; only the move did not.
      return { applied: lines, rev, changesetId, charts, clear, refusal };
    }
  }
  return { applied: lines, rev, changesetId, charts, clear };
}

// What changes did to the sheet's charts on its tab, in one changeset: the charts `clear_charts` took removed, those
// a resize, insert or delete left over other cells moved back onto their cells (sheet-chart-follow.ts), and the charts
// changes made added over the Sheet element, each with its first read. The lines it adds to the answer; none when
// nothing changed. New charts on a tab with no Sheet framing the sheet are not placed, and that is said.
async function updateSheetCharts(
  api: ApiClient,
  documentId: string,
  tab: TabRecord,
  wb: Workbook,
  sheetId: string,
  change: {
    add: readonly SheetChartOut[];
    clear: readonly (GridRange | null)[];
    before: SheetShape;
    after: SheetShape;
  },
  client: 'mcp' | 'cli',
): Promise<string[]> {
  const layout = wb.sheet(sheetId)!.layout;
  const els = tab.elements as unknown as SheetChartEl[];
  const removed = new Set(
    change.clear.flatMap((range) => chartsCleared(els, sheetId, layout, range)),
  );
  const moved = chartsFollowing(els, sheetId, change.before, change.after).filter(
    (m) => !removed.has(m.id),
  );
  const frame = tab.elements.find(
    (el) =>
      el.type === 'shape' &&
      el.shape === 'plan-sheet' &&
      (el as { planSheet?: { sheetId?: string } }).planSheet?.sheetId === sheetId,
  ) as { x: number; y: number; width: number; height: number } | undefined;
  const added = frame ? sheetChartElements(wb, frame, sheetId, change.add) : [];
  const lines: string[] = [];
  if (change.add.length && !frame)
    lines.push('no Sheet on its tab frames the sheet, so its charts were not placed');
  const operations = [
    ...[...removed].map((target) => ({ op: 'rm', target })),
    ...moved.map((m) => ({ op: 'set', target: m.id, fields: { sheetAnchor: m.sheetAnchor } })),
    ...added.map((element) => ({ op: 'add', element })),
  ];
  if (operations.length === 0) return lines;
  const body: ChangesetRequest = {
    operations,
    base: { rev: tab.rev, elements: {} },
    summary: 'Charts of the sheet',
  };
  await api.json<ChangesetResponse>(`${tabPath(documentId, tab.id)}/changesets`, {
    method: 'POST',
    headers: { [CLIENT_HEADER]: client },
    body: JSON.stringify(body),
  });
  const count = (n: number, verb: string) => `${verb} ${n === 1 ? 'a chart' : `${n} charts`}`;
  if (removed.size) lines.push(count(removed.size, 'removed'));
  if (moved.length)
    lines.push(
      `${count(moved.length, 'moved')} back onto the cells ${moved.length === 1 ? 'it sits' : 'they sit'} on`,
    );
  if (added.length) lines.push(count(added.length, 'placed'));
  return lines;
}

// The changes that touch the sheet's charts on its tab: a design and the chart changes, and those that move cells.
const TOUCHES_CHARTS: ReadonlySet<SheetChange['op']> = new Set([
  'design',
  'chart',
  'clear_charts',
  'resize',
  'insert_rows',
  'insert_cols',
  'delete_rows',
  'delete_cols',
]);

// The caller's gallery pictures by id with their sizes, read only when a change places an image; a refusal for a
// server keeping no images or an id the gallery lacks.
async function galleryFor(
  api: ApiClient,
  changes: readonly SheetChange[],
): Promise<
  ReadonlyMap<string, GalleryPicture> | { refusal: { code: string; message: string } } | null
> {
  const placed = changes.flatMap((c) => (c.op === 'image' ? [c.imageId] : []));
  if (placed.length === 0) return null;
  let images: ImageSummary[];
  try {
    images = (await api.json<{ images?: ImageSummary[] }>('/images')).images ?? [];
  } catch (err) {
    if (err instanceof ApiError && err.status === 503)
      return { refusal: { code: 'images_unavailable', message: IMAGES_UNAVAILABLE } };
    throw err;
  }
  const held = new Set(images.map((i) => i.id));
  const missing = placed.find((imageId) => !held.has(imageId));
  if (missing !== undefined)
    return { refusal: { code: 'image_not_found', message: notInGallery(missing) } };
  return new Map(images.map((i) => [i.id, { width: i.width, height: i.height }]));
}

export async function changeSheet(
  api: ApiClient,
  documentId: string,
  input: { sheet: string; changes: readonly SheetChange[] },
  client: 'mcp' | 'cli',
): Promise<SheetChangesResult> {
  const state = await readSheetsState(api, documentId);
  const { sheets } = state;
  const found = resolveSheet(sheets, input.sheet);
  if (!found.ok) {
    const { code, message } = found;
    return {
      sheetId: '',
      title: input.sheet,
      applied: [],
      rev: null,
      changesetId: null,
      refusal: { code, message },
    };
  }
  const { id, tabId } = found.sheet;
  // An image's imageId names a picture in the caller's gallery (inserted-objects.md "Agents"), checked before anything.
  const gallery = await galleryFor(api, input.changes);
  if (gallery && 'refusal' in gallery)
    return {
      sheetId: id,
      title: found.sheet.title,
      applied: [],
      rev: null,
      changesetId: null,
      refusal: gallery.refusal,
    };
  const wb = await workbookFor(api, documentId, state, tabId);
  // A design is tinted for its tab's canvas, and charts are on the tab: read it only when a change needs it.
  // A spreadsheet's charts are its sheet's own, anchored to cells: its tab holds none, so it is never read.
  const needsTab = state.workbook === null && input.changes.some((c) => TOUCHES_CHARTS.has(c.op));
  const readTab = async () => (await api.json<TabResponse>(tabPath(documentId, tabId))).tab;
  const early = needsTab ? await readTab() : null;
  const dark = darkCanvas(early?.backgroundColor);
  // Rows are measured in the tab's font where the tab is at hand, before and after alike.
  const font = early?.font;
  const before = { layout: wb.sheet(id)!.layout, heights: rowHeights(wb, id, font) };
  const { charts, clear, ...result } = await applySheetChanges(
    api,
    documentId,
    wb,
    id,
    input.changes,
    client,
    documentCellCount(sheets),
    Math.random,
    { dark, font, spreadsheet: state.workbook !== null, ...(gallery ? { gallery } : {}) },
  );
  // A change to cells alone can make rows taller or shorter (sheet.md "Row height"), which moves the cells under a
  // chart as a resize does: the tab is read then too.
  const after = { layout: wb.sheet(id)!.layout, heights: rowHeights(wb, id, font) };
  const tab =
    early ?? (state.workbook === null && after.heights !== before.heights ? await readTab() : null);
  if (tab) {
    try {
      const lines = await updateSheetCharts(
        api,
        documentId,
        tab,
        wb,
        id,
        { add: charts, clear, before, after },
        client,
      );
      result.applied.push(...lines);
    } catch (err) {
      const refusal = apiRefusalOf(err);
      if (!refusal) throw err;
      return { sheetId: id, title: wb.sheet(id)!.title, ...result, refusal };
    }
  }
  return { sheetId: id, title: wb.sheet(id)!.title, ...result };
}
