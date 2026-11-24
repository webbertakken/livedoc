'use client';

// Format › Number › Custom Date and Time (docs/specs/029-sheets/formatting.md "Number formats", D197, D198): the
// shell's dialog with the format as a row of parts, each block a choice of its tokens and each piece of text a
// field, Add for a block at the end, Google's presets, and a preview. Apply formats the selection, one undo step.
import { useState } from 'react';
import { formatCodeDraw, type CellFormat, type Value } from '@livedoc/sheets';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import {
  DATE_BLOCKS,
  DATE_TIME_PRESETS,
  DATE_TIME_SAMPLE,
  blockExample,
  dateCode,
  dateParts,
  dateTimeStart,
  type DateBlock,
  type DatePart,
} from '@/lib/spreadsheet/custom-date-time';

const HEADING = 'mb-2 text-body font-medium';
const CONTROL =
  'h-prominent rounded-control border border-(--office-line) bg-transparent px-2 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) [&>option]:bg-(--office-menu)';
const REMOVE =
  'touch-target rounded-full px-1 text-(--office-icon) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)';

const BLOCKS = Object.keys(DATE_BLOCKS) as DateBlock[];

export function CustomDateTimeDialog({
  value,
  format,
  locale,
  onApply,
  onClose,
}: {
  value: Value;
  format: CellFormat | undefined;
  locale: string;
  onApply: (code: string) => void;
  onClose: () => void;
}) {
  const [parts, setParts] = useState<DatePart[]>(() => dateTimeStart(format, locale));
  const code = dateCode(parts);
  const hasBlock = parts.some((part) => part.kind === 'block');
  const preview = formatCodeDraw(typeof value === 'number' ? value : DATE_TIME_SAMPLE, code).text;
  const change = (at: number, next: DatePart | null) =>
    setParts((now) =>
      next === null ? now.filter((_, i) => i !== at) : now.map((p, i) => (i === at ? next : p)),
    );
  return (
    <OfficeDialog
      open
      onClose={onClose}
      title="Custom Date and Time Formats"
      wide
      primary={{ label: 'Apply', onPress: () => onApply(code), disabled: !hasBlock }}
    >
      <div className="flex flex-col gap-4 pt-1">
        <div>
          <h3 className={HEADING}>Format</h3>
          <div className="flex flex-wrap items-center gap-2">
            {parts.map((part, i) =>
              part.kind === 'block' ? (
                <span key={i} className="inline-flex items-center gap-1">
                  <select
                    aria-label={DATE_BLOCKS[part.block].label}
                    value={part.token}
                    onChange={(e) => change(i, { ...part, token: e.target.value })}
                    className={CONTROL}
                  >
                    {DATE_BLOCKS[part.block].tokens.map((token) => (
                      <option key={token} value={token}>
                        {`${DATE_BLOCKS[part.block].label} (${blockExample(part.block, token)})`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={`Remove ${DATE_BLOCKS[part.block].label}`}
                    onClick={() => change(i, null)}
                    className={REMOVE}
                  >
                    ×
                  </button>
                </span>
              ) : (
                <span key={i} className="inline-flex items-center gap-1">
                  <input
                    aria-label="Text"
                    value={part.text}
                    size={Math.max(part.text.length, 1)}
                    onChange={(e) => change(i, { kind: 'text', text: e.target.value })}
                    className={`${CONTROL} w-auto font-mono`}
                  />
                  <button
                    type="button"
                    aria-label="Remove Text"
                    onClick={() => change(i, null)}
                    className={REMOVE}
                  >
                    ×
                  </button>
                </span>
              ),
            )}
            <select
              aria-label="Add"
              value=""
              onChange={(e) => {
                const block = e.target.value as DateBlock;
                setParts((now) => [
                  ...now,
                  { kind: 'block', block, token: DATE_BLOCKS[block].tokens[0]! },
                ]);
              }}
              className={CONTROL}
            >
              <option value="" disabled>
                Add
              </option>
              {BLOCKS.map((block) => (
                <option key={block} value={block}>
                  {DATE_BLOCKS[block].label}
                </option>
              ))}
            </select>
          </div>
          <p role="status" className="mt-3 text-body">
            <span className="text-(--office-muted)">Preview: </span>
            {preview}
          </p>
        </div>
        <div>
          <h3 className={HEADING}>Presets</h3>
          <ul className="max-h-60 overflow-y-auto rounded-control border border-(--office-line)">
            {DATE_TIME_PRESETS.map((preset) => {
              const shown = formatCodeDraw(DATE_TIME_SAMPLE, preset).text;
              return (
                <li key={preset}>
                  <button
                    type="button"
                    aria-label={`${shown}, ${preset}`}
                    onClick={() => setParts(dateParts(preset)!)}
                    className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left text-body outline-none hover:bg-(--office-hover) focus-visible:bg-(--office-hover)"
                  >
                    <span>{shown}</span>
                    <span className="shrink-0 font-mono text-(--office-muted)">{preset}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </OfficeDialog>
  );
}
