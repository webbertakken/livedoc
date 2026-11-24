'use client';

// LiveDoc's own small dialog before the browser's (docs/specs/035-pdf-documents/files-print-and-sync.md "Printing"):
// only what the browser cannot know. Pages: all, the current one, or a range; Marks: the document with LiveDoc's marks,
// or as it arrived. Enter prints, Escape closes; a range that is none says so under its field and prints nothing.
import { useId, useState } from 'react';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { pageRangeProblem, parsePageRange } from '@/lib/pdf-document/pdf-page-range';
import type { PdfPrintChoice } from '@/lib/pdf-document/pdf-print';

type Pages = 'all' | 'current' | 'range';

const RADIO = 'size-icon-row shrink-0 accent-(--office-primary)';
const OPTION = 'flex min-h-row items-center gap-3 text-body pointer-coarse:min-h-11';

export function PdfPrintDialog({
  open,
  count,
  current,
  onClose,
  onPrint,
}: {
  open: boolean;
  // The pages in the file, and the one in view, by its index.
  count: number;
  current: number;
  onClose: () => void;
  onPrint: (choice: PdfPrintChoice) => void;
}) {
  const name = useId();
  const problemId = useId();
  const [pages, setPages] = useState<Pages>('all');
  const [range, setRange] = useState('');
  const [marks, setMarks] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);

  const print = () => {
    if (pages !== 'range') return onPrint({ pages: pages === 'all' ? null : [current], marks });
    const chosen = parsePageRange(range, count);
    if (!chosen) return setProblem(pageRangeProblem(count));
    onPrint({ pages: chosen, marks });
  };

  return (
    <OfficeDialog
      open={open}
      onClose={onClose}
      title="Print"
      primary={{ label: 'Print', onPress: print }}
    >
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-body">Pages</legend>
        <label className={OPTION}>
          <input
            type="radio"
            name={`${name}-pages`}
            className={RADIO}
            checked={pages === 'all'}
            onChange={() => setPages('all')}
          />
          All
        </label>
        <label className={OPTION}>
          <input
            type="radio"
            name={`${name}-pages`}
            className={RADIO}
            checked={pages === 'current'}
            onChange={() => setPages('current')}
          />
          Current page
        </label>
        <div className={OPTION}>
          <label className="flex items-center gap-3">
            <input
              type="radio"
              name={`${name}-pages`}
              className={RADIO}
              checked={pages === 'range'}
              onChange={() => setPages('range')}
            />
            Pages
          </label>
          <input
            type="text"
            aria-label="Pages to print"
            placeholder="1-3, 8"
            value={range}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? problemId : undefined}
            onFocus={() => setPages('range')}
            onChange={(event) => {
              setRange(event.target.value);
              setProblem(null);
            }}
            className="h-field min-w-0 flex-1 rounded-control border border-(--office-line) bg-transparent px-2 text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-invalid:border-(--office-error) pointer-coarse:h-11 pointer-coarse:text-base"
          />
        </div>
        {problem ? (
          <p id={problemId} role="alert" className="text-body text-(--office-error)">
            {problem}
          </p>
        ) : null}
      </fieldset>
      <fieldset className="mt-4 grid gap-1">
        <legend className="mb-1 text-body">Marks</legend>
        <label className={OPTION}>
          <input
            type="radio"
            name={`${name}-marks`}
            className={RADIO}
            checked={marks}
            onChange={() => setMarks(true)}
          />
          Document and marks
        </label>
        <label className={OPTION}>
          <input
            type="radio"
            name={`${name}-marks`}
            className={RADIO}
            checked={!marks}
            onChange={() => setMarks(false)}
          />
          Document only
        </label>
      </fieldset>
    </OfficeDialog>
  );
}
