'use client';

// The grid's clipboard (docs/specs/029-sheets/sheet.md "Clipboard"): copy and cut put the selection on the
// clipboard as the sheet's own cells, tab-separated text and an HTML table; paste reads the sheet's own cells
// (formulas shifted, or a cut moved with every reference following), else an HTML table, else text. The last copy
// is also kept here, for Paste Values Only and Paste Formatting Only and for browsers that drop custom types.
import { useMemo } from 'react';
import {
  SHEET_CLIP_TYPE,
  clipFromRange,
  clipFromRows,
  clipToHtml,
  clipToTsv,
  pasteClip,
  pasteCut,
  pasteClipLayout,
  pasteWithRules,
  pasteExternal,
  readPastedHtml,
  parsePastedText,
  type GridRange,
  type LayoutPasteMode,
  type PasteMode,
  type PasteResult,
  type PasteSpecialMode,
  type SheetClip,
} from '@livedoc/sheets';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { useSheetController, type SheetController } from './sheet-controller';
import {
  drawnRect,
  rowsDrawn,
  selectDrawn,
  sideBySide,
  storedRanges,
} from './sheet-drawn-selection';

let lastClip: SheetClip | null = null;

const LAYOUT_MODES: readonly string[] = [
  'widths',
  'formatRules',
  'validation',
] satisfies LayoutPasteMode[];

// What a layout item says when the copy holds none of what it pastes (D144).
const NONE_COPIED: Record<LayoutPasteMode, string> = {
  widths: 'The copied cells hold no column widths',
  formatRules: 'The copied cells hold no conditional formatting',
  validation: 'The copied cells hold no data validation',
};

export const COPY_CELLS_FIRST = 'Copy cells in this spreadsheet first';

/** Said when a cut, or where it lands, is rows a view draws side by side that are apart in the sheet (D494). */
export const CUT_IN_SORTED_VIEW = 'Cut rows side by side in the sheet, or close the filter view';

export function lastSheetClip(): SheetClip | null {
  return lastClip;
}

// `drawn`: the result's range is in drawn rows, a paste landing down the rows a view draws (D494).
function apply(c: SheetController, result: PasteResult | null, cut = false, drawn = false): void {
  if (!result) return;
  // One change, one undo step, however many sheets it reaches (a cut whose cells other sheets' formulas read).
  if (!c.writeAll(result.edits, 'Paste')) return;
  const r = result.range;
  if (drawn) c.setSelection(selectDrawn(c.geometry, r));
  else c.setSelection({ ranges: [r], active: { r: r.r1, c: r.c1 }, anchor: { r: r.r1, c: r.c1 } });
  if (result.truncated || cut)
    c.toast('A sheet holds up to 10,000 rows and 200 columns: the paste was cut there');
}

export function useSheetClipboard() {
  const c = useSheetController();
  return useMemo(() => {
    const primary = () => {
      const ranges = c.selectionNow().ranges;
      return ranges[ranges.length - 1]!;
    };
    // Under a drawn order the rows on screen, in that order (D494); one range when they are side by side in the sheet.
    const copied = (cut: boolean) => {
      const g = c.geometry;
      const rect = g.order ? drawnRect(g, c.selectionNow()) : null;
      const rows = rect ? rowsDrawn(g, rect) : null;
      if (!rect || !rows || sideBySide(rows)) {
        const range = rect ? { ...rect, r1: rows![0]!, r2: rows![rows!.length - 1]! } : primary();
        return { clip: clipFromRange(c.workbook, c.sheet.id, range, cut), range, runs: undefined };
      }
      if (cut) return null;
      const runs = storedRanges(g, rect);
      return {
        clip: clipFromRows(c.workbook, c.sheet.id, rows, rect, false),
        range: runs[0]!,
        runs,
      };
    };
    const copy = (e: React.ClipboardEvent<HTMLElement> | null, cut: boolean) => {
      const made = copied(cut);
      if (!made) {
        debugLog('[sheet] cut refused', { reason: 'rows apart in a sorted view' });
        e?.preventDefault();
        return c.toast(CUT_IN_SORTED_VIEW);
      }
      const { clip, range, runs } = made;
      if (!clip) return;
      lastClip = clip;
      if (e) {
        e.preventDefault();
        e.clipboardData.setData('text/plain', clipToTsv(clip.values));
        e.clipboardData.setData('text/html', clipToHtml(clip));
        try {
          e.clipboardData.setData(SHEET_CLIP_TYPE, JSON.stringify(clip));
        } catch {
          // A browser that refuses a custom type still has the plain and HTML forms, and lastClip.
        }
      }
      c.setMarquee({ range, cut, ...(runs ? { runs } : {}) });
      const n = clip.rows * clip.cols;
      c.announce(`${cut ? 'Cut' : 'Copied'} ${n} cell${n === 1 ? '' : 's'}`);
    };

    // Where a paste of `rows` lands: under a drawn order, down the rows drawn from the selection's top (D494), as
    // `drawn` (in drawn rows) when they are apart in the sheet, else as the stored range they are; the selection's
    // range without an order.
    const target = (rows: number): { drawn: GridRange | null; at: GridRange } => {
      const g = c.geometry;
      if (!g.order) return { drawn: null, at: primary() };
      const rect = drawnRect(g, c.selectionNow());
      const reach = Math.max(rows, rect.r2 - rect.r1 + 1);
      const landing = rowsDrawn(g, {
        ...rect,
        r2: Math.min(rect.r1 + reach, g.order.storedAt.length) - 1,
      });
      if (!sideBySide(landing)) return { drawn: rect, at: rect };
      const r2 = landing[0]! + (rect.r2 - rect.r1);
      return { drawn: null, at: { ...rect, r1: landing[0]!, r2 } };
    };
    const pasteOwn = (clip: SheetClip, mode: PasteMode) => {
      const { drawn, at } = target(clip.rows);
      // Rows apart in the sheet, copied or landing: each row on its own, a formula shifted from its own row, no rules
      // (D494); a cut there is refused.
      if (drawn || clip.fromRows) {
        if (clip.cut) {
          debugLog('[sheet] cut refused', { reason: 'lands apart in a sorted view' });
          return c.toast(CUT_IN_SORTED_VIEW);
        }
        const order = drawn ? c.geometry.order : null;
        return apply(
          c,
          pasteClip(c.workbook, c.sheet.id, at, clip, mode, Math.random, order),
          false,
          !!drawn,
        );
      }
      // An Editor's plain paste carries the copied cells' rules (D155); a Participant's lands as values.
      if (mode === 'all' && c.canShape) {
        const pasted = pasteWithRules(c.workbook, c.sheet.id, at, clip);
        // A table the paste could not set down (data-tools.md "Tables", D454): the cells still land.
        for (const reason of pasted?.tablesRefused ?? [])
          debugLog('[sheet] table refused', { reason, by: 'paste' });
        apply(c, pasted);
        if (clip.cut) {
          lastClip = null;
          c.setMarquee(null);
        }
      } else if (clip.cut && mode === 'all') {
        apply(c, pasteCut(c.workbook, c.sheet.id, { r: at.r1, c: at.c1 }, clip));
        lastClip = null;
        c.setMarquee(null);
      } else {
        apply(c, pasteClip(c.workbook, c.sheet.id, at, clip, mode));
      }
    };

    const paste = (data: DataTransfer, mode: PasteMode) => {
      if (!c.canEdit) return;
      const own = data.getData(SHEET_CLIP_TYPE);
      const text = data.getData('text/plain');
      const html = data.getData('text/html');
      // Nothing readable (an image, files): nothing changes.
      if (!own && !text && !html) return;
      track('Sheet', 'Changed', 'Paste');
      let clip: SheetClip | null = null;
      if (own) {
        try {
          clip = JSON.parse(own) as SheetClip;
        } catch {
          clip = null;
        }
      }
      if (!clip && lastClip && text === clipToTsv(lastClip.values)) clip = lastClip;
      if (clip && clip.v === 1) return pasteOwn(clip, mode);
      const fromHtml = html ? readPastedHtml(html) : null;
      const rows = fromHtml ?? (text ? parsePastedText(text).rows : []);
      // Down the rows a view draws, when they are apart in the sheet (D494); no merges there.
      const { drawn, at } = target(rows.length);
      const order = drawn ? c.geometry.order : null;
      if (fromHtml)
        return apply(
          c,
          // Google's and Excel's spanning cells merge for an Editor (D154).
          pasteExternal(c.workbook, c.sheet.id, at, fromHtml, mode, {
            merges: c.canShape && !drawn,
            drawn: order,
          }),
          false,
          !!drawn,
        );
      if (!text) return;
      const parsed = parsePastedText(text);
      apply(
        c,
        pasteExternal(c.workbook, c.sheet.id, at, parsed.rows, mode, { drawn: order }),
        parsed.truncated,
        !!drawn,
      );
    };

    return {
      onCopy: (e: React.ClipboardEvent<HTMLElement>) => {
        if (c.editing) return;
        copy(e, false);
      },
      onCut: (e: React.ClipboardEvent<HTMLElement>) => {
        if (c.editing) return;
        if (!c.canEdit) return copy(e, false);
        copy(e, true);
      },
      onPaste: (e: React.ClipboardEvent<HTMLElement>) => {
        if (c.editing) return;
        e.preventDefault();
        paste(e.clipboardData, 'all');
      },
      copyNow: (cut: boolean) => {
        copy(null, cut);
        if (lastClip)
          void navigator.clipboard?.writeText?.(clipToTsv(lastClip.values)).catch(() => {});
      },
      // Paste Special (Edit › Paste Special, Ctrl/⌘+Shift+V, the cell menu): from the last copy, or text copied
      // elsewhere where the item reads it (D144).
      async pasteSpecial(mode: PasteSpecialMode) {
        if (!c.canEdit) return;
        const text = await navigator.clipboard?.readText?.().catch(() => '');
        const own = lastClip && (!text || text === clipToTsv(lastClip.values)) ? lastClip : null;
        if (LAYOUT_MODES.includes(mode)) {
          const layoutMode = mode as LayoutPasteMode;
          if (!own) return c.toast(COPY_CELLS_FIRST);
          const at = primary();
          const result = pasteClipLayout(
            c.workbook,
            c.sheet.id,
            { r: at.r1, c: at.c1 },
            own,
            layoutMode,
          );
          debugLog('[sheet] paste special', { mode, pasted: !!result });
          return result ? apply(c, result) : c.toast(NONE_COPIED[layoutMode]);
        }
        const cellMode = mode as Exclude<PasteMode, 'all'>;
        if (own) return pasteOwn(own, cellMode);
        if (cellMode === 'formats') return c.toast(COPY_CELLS_FIRST);
        if (!text) return;
        const parsed = parsePastedText(text);
        apply(
          c,
          pasteExternal(c.workbook, c.sheet.id, primary(), parsed.rows, cellMode),
          parsed.truncated,
        );
      },
      async pasteNow() {
        if (!c.canEdit) return;
        const text = await navigator.clipboard?.readText?.().catch(() => '');
        if (lastClip && (!text || text === clipToTsv(lastClip.values)))
          return pasteOwn(lastClip, 'all');
        if (!text) return;
        const parsed = parsePastedText(text);
        apply(
          c,
          pasteExternal(c.workbook, c.sheet.id, primary(), parsed.rows, 'all'),
          parsed.truncated,
        );
      },
    };
  }, [c]);
}
