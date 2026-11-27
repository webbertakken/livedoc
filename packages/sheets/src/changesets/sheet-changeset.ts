// A sheet changeset planned (docs/specs/024-agents/agent-changesets.md "A sheet's changesets"): ordered writes, each
// checked and applied against the sheet as the ones before it leave it, so the whole lands or none of it does. The
// plan answers the writes as they landed (relayed one by one), their inverse in undo order, one net change per cell
// (what the store writes once), the counts, and the after-image its revert compares against (D265).
import { Protection, protectionsTouched, type ProtectionCaller } from '../protection';
import type { FormatPatch } from '../format';
import { applySheetWrite, inverseSheetWrite, type CellChange, type SheetWrite } from '../store';
import { splitCellKey, type Cell, type CellFormat, type Sheet, type SheetPerson } from '../sheet';
import { validateWrite, type WriteCheck } from '../validate';
import type { SheetRejection } from '../validate';
import {
  afterImageOf,
  canonicalJson,
  cellImage,
  thingKeyOf,
  type SheetChangesetAfter,
} from './after-image';

export type SheetChangesetCounts = { added: number; changed: number; removed: number };

export type SheetChangesetPlan = {
  ok: true;
  // The sheet as the changeset leaves it.
  sheet: Sheet;
  applied: SheetWrite[];
  // The writes that undo it, last write's first.
  inverse: SheetWrite[];
  // One change per cell it changed: the final input and the format's difference from the stored one.
  net: CellChange[];
  counts: SheetChangesetCounts;
  after: SheetChangesetAfter;
  // Whether it changes anything at all.
  changes: boolean;
  // The warning protections it wrote under (data-tools.md "Protected ranges"), by id: never asked, only logged.
  warned: string[];
};

export type SheetChangesetRefusal = {
  ok: false;
  error: SheetRejection;
  // The refused write's position, from 0.
  index: number;
  at?: string;
  line?: string;
};

export type SheetChangesetContext = {
  now: number;
  by: SheetPerson;
  check: WriteCheck;
  // Who writes, for the sheet's protections (data-tools.md "Protected ranges").
  caller: ProtectionCaller;
};

// The patch that turns a stored format into `after`: its keys set, the stored keys it lacks cleared; null clears it all.
function formatDiff(
  before: CellFormat | undefined,
  after: CellFormat | undefined,
): FormatPatch | null {
  if (!after || Object.keys(after).length === 0) return null;
  const patch: FormatPatch = {};
  for (const key of Object.keys(before ?? {})) patch[key as keyof FormatPatch] = null;
  return { ...patch, ...(after as FormatPatch) };
}

function netChange(key: string, before: Cell | undefined, after: Cell | undefined): CellChange {
  const { r, c } = splitCellKey(key);
  const change: CellChange = { r, c };
  if (canonicalJson(before?.input ?? null) !== canonicalJson(after?.input ?? null))
    change.i = after?.input ?? null;
  if (canonicalJson(before?.format ?? null) !== canonicalJson(after?.format ?? null))
    change.f = formatDiff(before?.format, after?.format);
  return change;
}

export function planSheetChangeset(
  before: Sheet,
  writes: readonly SheetWrite[],
  ctx: SheetChangesetContext,
): SheetChangesetPlan | SheetChangesetRefusal {
  let sheet = before;
  const applied: SheetWrite[] = [];
  const inverse: SheetWrite[] = [];
  const touched = new Set<string>();
  const things = new Set<string>();
  let titled = false;
  const warned = new Set<string>();
  for (const [index, raw] of writes.entries()) {
    let result;
    try {
      // Each write against the sheet as the ones before it left it (D347).
      const touched = protectionsTouched(sheet.layout, raw);
      const refused = touched.find((p) => !Protection.admits(p, ctx.caller));
      if (refused)
        return {
          ok: false,
          error: 'protected',
          index,
          at: refused.id,
          line: Protection.refusalLine(refused),
        };
      for (const p of touched) if (p.can === 'warn') warned.add(p.id);
      // A malformed write can throw in the check or the apply: refused as the write route refuses it.
      const check = validateWrite(sheet, raw, ctx.check);
      if (!check.ok)
        return { ok: false, error: check.error, index, at: check.at, line: check.line };
      const write: SheetWrite = raw.kind === 'title' ? { ...raw, title: raw.title.trim() } : raw;
      result = applySheetWrite(sheet, write, { now: ctx.now, by: ctx.by });
    } catch {
      return { ok: false, error: 'write_invalid', index };
    }
    inverse.unshift(inverseSheetWrite(sheet, result));
    applied.push(result.applied);
    for (const key of result.touched) touched.add(key);
    if (raw.kind === 'title') titled = true;
    if (raw.kind === 'layout')
      for (const change of raw.changes) {
        const key = thingKeyOf(change);
        if (key) things.add(key);
      }
    sheet = result.sheet;
  }
  const net: CellChange[] = [];
  const counts: SheetChangesetCounts = { added: 0, changed: 0, removed: 0 };
  const changed: string[] = [];
  for (const key of touched) {
    const was = before.cells.get(key);
    const now = sheet.cells.get(key);
    if (cellImage(was) === cellImage(now)) continue;
    changed.push(key);
    net.push(netChange(key, was, now));
    if (!was) counts.added++;
    else if (!now) counts.removed++;
    else counts.changed++;
  }
  const changes =
    net.length > 0 ||
    sheet.title !== before.title ||
    canonicalJson(sheet.layout) !== canonicalJson(before.layout);
  return {
    ok: true,
    sheet,
    applied,
    inverse,
    net,
    counts,
    after: afterImageOf(sheet, changed, things, titled),
    changes,
    warned: [...warned],
  };
}
