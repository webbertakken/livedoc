'use client';

// Tools > Word count (docs/specs/034-text-documents/tools.md "Word count", The dialog): the document's pages, words,
// characters and characters excluding spaces, each "12 of 340" with a selection; Pages only where pages are laid out;
// the person's Display word count while typing; OK closes. The look is (default) until a capture of Google's dialog.
import { Button } from '@livedoc/ui';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import type { WordCounts } from '@/lib/text-document/text-document-word-count';

const number = new Intl.NumberFormat();

/** A count, or "selected of all" with a selection. */
export const countOf = (all: number, selected: number | null): string =>
  selected === null ? number.format(all) : `${number.format(selected)} of ${number.format(all)}`;

export function TextDocumentWordCountDialog({
  counts,
  selected,
  pages,
  whileTyping,
  onWhileTyping,
  onClose,
}: {
  counts: WordCounts;
  /** The selection's counts; null with nothing selected. */
  selected: WordCounts | null;
  /** The pages laid out; null where there are none. */
  pages: number | null;
  whileTyping: boolean;
  onWhileTyping: (on: boolean) => void;
  onClose: () => void;
}) {
  const rows: [string, string][] = [
    ...(pages === null ? [] : ([['Pages', countOf(pages, null)]] as [string, string][])),
    ['Words', countOf(counts.words, selected?.words ?? null)],
    ['Characters', countOf(counts.characters, selected?.characters ?? null)],
    [
      'Characters excluding spaces',
      countOf(counts.charactersExcludingSpaces, selected?.charactersExcludingSpaces ?? null),
    ],
  ];
  return (
    <OfficeDialog open onClose={onClose} title="Word count">
      <div className="flex flex-col gap-4 pt-1">
        <table className="w-full text-body">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-b border-(--office-line) last:border-b-0">
                <th scope="row" className="py-2 text-left font-normal">
                  {label}
                </th>
                <td className="py-2 text-right tabular-nums">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <label className="flex items-center gap-3 text-body">
          <input
            type="checkbox"
            className="size-icon-row shrink-0 accent-(--office-primary)"
            checked={whileTyping}
            onChange={(event) => onWhileTyping(event.target.checked)}
          />
          Display word count while typing
        </label>
        <div className="flex justify-end pt-2">
          <Button onClick={onClose}>OK</Button>
        </div>
      </div>
    </OfficeDialog>
  );
}
