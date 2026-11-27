'use client';

// The grid's clipboard (docs/specs/029-sheets/sheet.md "Clipboard"): copy and cut put the selection on the
// clipboard as the sheet's own cells, tab-separated text and an HTML table; paste reads the sheet's own cells
// (formulas shifted, or a cut moved with every reference following), else an HTML table, else text. The last copy
// is also kept here, for Paste Values Only and Paste Formatting Only and for browsers that drop custom types.
import { useMemo } from 'react';
import {
  SHEET_CLIP_TYPE,
  clipFromRange,
  clipToHtml,
  clipToTsv,
  pasteClip,
  pasteCut,
  pasteClipLayout,
  pasteWithRules,
  pasteExternal,
  readPastedHtml,
  parsePastedText,
  type LayoutPasteMode,
  type PasteMode,
  type PasteResult,
  type PasteSpecialMode,
  type SheetClip,
} from '@livedoc/sheets';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { useSheetController, type SheetController } from './sheet-controller';

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

export function lastSheetClip(): SheetClip | null {
  return lastClip;
}

function apply(c: SheetController, result: PasteResult | null, cut = false): void {
  if (!result) return;
  // One change, one undo step, however many sheets it reaches (a cut whose cells other sheets' formulas read).
  if (!c.writeAll(result.edits, 'Paste')) return;
  const r = result.range;
  c.setSelection({ ranges: [r], active: { r: r.r1, c: r.c1 }, anchor: { r: r.r1, c: r.c1 } });
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
    const copy = (e: React.ClipboardEvent<HTMLElement> | null, cut: boolean) => {
      const range = primary();
      const clip = clipFromRange(c.workbook, c.sheet.id, range, cut);
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
      c.setMarquee({ range, cut });
      const n = clip.rows * clip.cols;
      c.announce(`${cut ? 'Cut' : 'Copied'} ${n} cell${n === 1 ? '' : 's'}`);
    };

    const pasteOwn = (clip: SheetClip, mode: PasteMode) => {
      const at = primary();
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
      if (fromHtml)
        return apply(
          c,
          // Google's and Excel's spanning cells merge for an Editor (D154).
          pasteExternal(c.workbook, c.sheet.id, primary(), fromHtml, mode, { merges: c.canShape }),
        );
      if (!text) return;
      const parsed = parsePastedText(text);
      apply(
        c,
        pasteExternal(c.workbook, c.sheet.id, primary(), parsed.rows, mode),
        parsed.truncated,
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
