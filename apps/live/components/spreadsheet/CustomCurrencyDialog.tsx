'use client';

// Format › Number › Custom Currency (docs/specs/029-sheets/formatting.md "Number formats", D195, D196): the shell's
// dialog with a search over the currencies the browser knows, then the picked one's formats, each with its preview.
// Apply formats the selection with the format's code, one undo step.
import { useMemo, useState } from 'react';
import { formatCodeDraw } from '@livedoc/sheets';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { OfficeDialogSearch } from '@/components/office/OfficeDialogFields';
import {
  currencyFormats,
  currencyList,
  currencyMatches,
  type Currency,
} from '@/lib/spreadsheet/custom-currency';

// What each format's preview draws (D190's example).
const PREVIEW = 1000.12;
const HEADING = 'mb-2 text-body font-medium';
const ROW =
  'flex cursor-pointer items-center justify-between gap-4 px-3 py-2 text-body has-checked:bg-(--office-hover) has-focus-visible:ring-2 has-focus-visible:ring-(--office-focus)';

export function CustomCurrencyDialog({
  locale,
  onApply,
  onClose,
}: {
  locale: string;
  onApply: (code: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const list = useMemo(() => currencyList(locale), [locale]);
  const matches = currencyMatches(list, query);
  const pick = (next: Currency) => {
    setCurrency(next);
    // Its first format is ready, so Apply can run at once (D196).
    setCode(currencyFormats(next.symbol)[0]!.code);
  };
  return (
    <OfficeDialog
      open
      onClose={onClose}
      title="Custom Currencies"
      primary={{
        label: 'Apply',
        // Dimmed until a format is picked, so it only runs with one.
        onPress: () => onApply(code!),
        disabled: code === null,
      }}
    >
      <div className="flex flex-col gap-4 pt-1">
        <OfficeDialogSearch label="Search currencies" value={query} onChange={setQuery} />
        <fieldset className="flex min-h-0 flex-col">
          <legend className={HEADING}>Currency</legend>
          <div
            role="radiogroup"
            aria-label="Currency"
            className="max-h-52 overflow-y-auto rounded-control border border-(--office-line)"
          >
            {matches.length === 0 ? (
              <p className="px-3 py-2 text-body text-(--office-muted)">No currencies match</p>
            ) : (
              matches.map((c) => (
                <label key={c.code} className={ROW}>
                  <input
                    type="radio"
                    name="currency"
                    className="sr-only"
                    checked={currency?.code === c.code}
                    onChange={() => pick(c)}
                  />
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 text-(--office-muted)">
                    {c.code} {c.symbol}
                  </span>
                </label>
              ))
            )}
          </div>
        </fieldset>
        {currency ? (
          <fieldset className="flex flex-col">
            <legend className={HEADING}>Format</legend>
            <div
              role="radiogroup"
              aria-label="Format"
              className="rounded-control border border-(--office-line)"
            >
              {currencyFormats(currency.symbol).map((format) => (
                <label key={format.code} className={ROW}>
                  <input
                    type="radio"
                    name="currency-format"
                    className="sr-only"
                    checked={code === format.code}
                    onChange={() => setCode(format.code)}
                  />
                  <span>{formatCodeDraw(PREVIEW, format.code).text}</span>
                  <span className="shrink-0 font-mono text-(--office-muted)">{format.code}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>
    </OfficeDialog>
  );
}
