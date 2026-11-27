// Thinning applied (docs/specs/034-text-documents/live-editing-and-storage.md "Taking a version"): each version that
// goes hands its deletions, editors and who deleted what to the version that stays after it, in the same batch as the
// version just taken. A hand-over that would pass the room's row cap keeps the version rather than thin it.
import type { VersionEditorDto } from '@livedoc/api-schema';
import { base64OfBytes, bytesOfBase64, VersionSnapshots } from '@livedoc/text-documents';
import type { DocumentEnv } from '../types';
import {
  dropVersionStatement,
  putVersionStatement,
  rowBytes,
  type VersionRow,
} from './text-document-version-rows';
import { planThinning, type ThinningCaps } from './version-thinning';

/** One version's parts with another's handed to it. */
function handedTo(into: VersionRow, from: VersionRow): VersionRow {
  const editors = new Map<string | null, VersionEditorDto>(into.editors.map((e) => [e.key, e]));
  for (const editor of from.editors) if (!editors.has(editor.key)) editors.set(editor.key, editor);
  const deletedBy: Record<string, string> = { ...into.deletedBy };
  for (const [key, encoded] of Object.entries(from.deletedBy)) {
    const mine = deletedBy[key];
    const theirs = bytesOfBase64(encoded);
    if (!theirs) continue;
    const ours = mine ? bytesOfBase64(mine) : null;
    deletedBy[key] = base64OfBytes(ours ? VersionSnapshots.unionBytes([ours, theirs]) : theirs);
  }
  const merged = {
    ...into,
    deletions: VersionSnapshots.unionBytes([from.deletions, into.deletions]),
    editors: [...editors.values()],
    deletedBy,
  };
  return { ...merged, bytes: rowBytes(merged) };
}

/** The statements that thin the tab's versions, the one just taken among them; logs what went. */
export function thinningStatements(
  env: DocumentEnv,
  rows: readonly VersionRow[],
  now: number,
  caps: ThinningCaps & { readonly rowBytes: number },
  where: string,
): D1PreparedStatement[] {
  const plan = planThinning(
    rows.map((r) => ({
      id: r.id,
      seq: r.seq,
      kind: r.kind,
      takenAt: r.takenAt,
      bytes: r.bytes,
      ownBytes: r.bytes - r.deletions.byteLength,
    })),
    now,
    caps,
  );
  if (plan.length === 0) return [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const changed = new Map<string, VersionRow>();
  const dropped: string[] = [];
  let freed = 0;
  for (const { drop, into } of plan) {
    const from = byId.get(drop)!;
    const before = changed.get(into) ?? byId.get(into)!;
    const after = handedTo(before, from);
    if (after.bytes > caps.rowBytes) {
      console.warn(`[text-document] version-too-large ${where} bytes=${after.bytes}`);
      continue;
    }
    changed.set(into, after);
    dropped.push(drop);
    freed += from.bytes + before.bytes - after.bytes;
  }
  if (dropped.length > 0)
    console.info(
      `[text-document] versions-thinned ${where} count=${dropped.length} bytes=${freed}`,
    );
  return [
    ...[...changed.values()].map((row) => putVersionStatement(env, row)),
    ...dropped.map((id) => dropVersionStatement(env, rows[0]!.tabId, id)),
  ];
}
