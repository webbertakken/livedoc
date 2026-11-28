'use client';

// Data › Column Stats (docs/specs/029-sheets/data-tools.md "Column Stats"): the active column's figures as its cells
// show them, a column switcher, Ignore rows, the distribution and the frequent values. Read by everyone; it changes
// nothing and follows edits as they land.
import { readWorkbook } from '@/components/sheets/read-workbook';
import { useState } from 'react';
import { columnLetters, columnStats, statsBars, STATS_FREQUENT } from '@livedoc/sheets';
import { ChevronLeftIcon, ChevronRightIcon } from '@livedoc/ui';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { cellSpokenValue } from '@/components/sheets/sheet-cell-speech';
import { EMPTY_COLUMN, statFigure } from '@/lib/spreadsheet/clean-up-panels';

const ICON_BUTTON =
  'flex size-chip shrink-0 cursor-pointer items-center justify-center rounded-full text-(--office-icon) hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none disabled:cursor-default disabled:opacity-40';
const TOGGLE =
  'min-h-row cursor-pointer rounded-control px-2 text-body aria-pressed:bg-(--office-hover) aria-pressed:font-medium focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none';

export function SpreadsheetColumnStatsBody() {
  const c = useSheetController();
  // The active column, or the one the switcher went to until another column is selected.
  const active = c.selection.active.c;
  const [picked, setPicked] = useState<{ col: number; from: number } | null>(null);
  const col = picked && picked.from === active ? picked.col : active;
  const setCol = (next: number) => setPicked({ col: next, from: active });
  const [ignore, setIgnore] = useState(c.sheet.layout.frozenRows ?? 0);
  const [least, setLeast] = useState(false);
  const { sheet, workbook, version } = c;
  // The figures follow each change of the store (read-workbook.ts).
  const stats = readWorkbook(version, () => columnStats(workbook, sheet.id, col, ignore));
  const cols = sheet.layout.cols.length;
  const header =
    ignore > 0
      ? readWorkbook(version, () => cellSpokenValue(sheet, workbook, c.locale, 0, col)).trim()
      : '';
  const figure = (n: number) => statFigure(n, c.locale);
  const frequent = stats
    ? (least ? [...stats.frequency].reverse() : stats.frequency).slice(0, STATS_FREQUENT)
    : [];
  const bars = stats
    ? stats.histogram
      ? stats.histogram.map((b) => ({
          text: `${figure(b.from)} - ${figure(b.to)}`,
          count: b.count,
        }))
      : statsBars(stats.frequency)
    : [];
  const top = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous column"
          className={ICON_BUTTON}
          disabled={col === 0}
          onClick={() => setCol(col - 1)}
        >
          <ChevronLeftIcon size={16} />
        </button>
        <p className="min-w-0 flex-1 truncate text-center font-medium" aria-live="polite">
          Column {columnLetters(col)}
          {header ? <span className="font-normal text-(--office-muted)"> {header}</span> : null}
        </p>
        <button
          type="button"
          aria-label="Next column"
          className={ICON_BUTTON}
          disabled={col >= cols - 1}
          onClick={() => setCol(col + 1)}
        >
          <ChevronRightIcon size={16} />
        </button>
      </div>
      <label className="flex items-center justify-between gap-2">
        Ignore rows
        <input
          type="number"
          min={0}
          max={sheet.layout.rows.length}
          className="h-field w-20 rounded-control border border-(--office-line) bg-transparent px-2 text-body outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)"
          value={ignore}
          onChange={(e) => setIgnore(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        />
      </label>
      {!stats || stats.count === 0 ? (
        <p className="text-(--office-muted)">{EMPTY_COLUMN}</p>
      ) : (
        <>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            {[
              ['Count', stats.count],
              ['Empty', stats.empty],
              ['Unique', stats.unique],
              ...(stats.numbers
                ? ([
                    ['Sum', stats.numbers.sum],
                    ['Average', stats.numbers.average],
                    ['Median', stats.numbers.median],
                    ['Min', stats.numbers.min],
                    ['Max', stats.numbers.max],
                  ] as const)
                : []),
            ].map(([name, n]) => (
              <div key={name} className="contents">
                <dt className="text-(--office-muted)">{name}</dt>
                <dd className="text-right tabular-nums">{figure(Number(n))}</dd>
              </div>
            ))}
          </dl>
          <section aria-label="Distribution" className="flex flex-col gap-1">
            <h3 className="font-medium">Distribution</h3>
            <ul className="flex flex-col gap-1">
              {bars.map((b, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-2">
                  <span className="truncate">{b.text}</span>
                  <span
                    aria-hidden="true"
                    className="h-icon-chevron rounded-control bg-(--office-primary)"
                    style={{ width: `${(b.count / top) * 100}%` }}
                  />
                  <span className="tabular-nums">{figure(b.count)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section aria-label="Frequency" className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium">Frequency</h3>
              <span className="flex gap-1">
                <button
                  type="button"
                  className={TOGGLE}
                  aria-pressed={!least}
                  onClick={() => setLeast(false)}
                >
                  Most Frequent
                </button>
                <button
                  type="button"
                  className={TOGGLE}
                  aria-pressed={least}
                  onClick={() => setLeast(true)}
                >
                  Least Frequent
                </button>
              </span>
            </div>
            <ol className="flex flex-col">
              {frequent.map((v, i) => (
                <li key={i} className="flex min-h-row items-center justify-between gap-2">
                  <span className="truncate">{v.text}</span>
                  <span className="tabular-nums">{figure(v.count)}</span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
