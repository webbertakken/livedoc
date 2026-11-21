// View > Text width (docs/specs/034-text-documents/page-layout.md "Pageless"): a person's own width for the pageless
// column, kept in this browser, Medium until chosen; the chosen one checked; dimmed while the document has pages; the
// choice counted before it is kept.
import { useMemo } from 'react';
import { useLocalStorageValue, writeLocalStorageValue } from '@/hooks/ui/useLocalStorageValue';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { TEXT_WIDTHS, type TextWidth } from './text-document-page';

/** Where this browser keeps it. */
export const TEXT_WIDTH_KEY = 'livedoc:v2:text-document-text-width';

/** Its items, by width (text-document-menus.ts). */
export const TEXT_WIDTH_ITEMS: Record<TextWidth, string> = {
  narrow: 'text-width-narrow',
  medium: 'text-width-medium',
  wide: 'text-width-wide',
  full: 'text-width-full',
};

// Telemetry types, one per width (`UI · Changed`).
const TELEMETRY: Record<TextWidth, string> = {
  narrow: 'TextDocumentTextWidthNarrow',
  medium: 'TextDocumentTextWidthMedium',
  wide: 'TextDocumentTextWidthWide',
  full: 'TextDocumentTextWidthFull',
};

const isTextWidth = (value: string | null): value is TextWidth =>
  (TEXT_WIDTHS as readonly string[]).includes(value ?? '');

export function useTextDocumentTextWidth(pageless: boolean): {
  width: TextWidth;
  actions: OfficeActions;
} {
  const stored = useLocalStorageValue(TEXT_WIDTH_KEY);
  const width: TextWidth = isTextWidth(stored) ? stored : 'medium';
  const actions = useMemo(
    (): OfficeActions =>
      Object.fromEntries(
        TEXT_WIDTHS.map((choice) => [
          TEXT_WIDTH_ITEMS[choice],
          {
            checked: width === choice,
            disabled: !pageless,
            run: () => {
              // Counted before the choice is kept.
              track('UI', 'Changed', TELEMETRY[choice]);
              debugLog('[text-document] text width', { width: choice });
              writeLocalStorageValue(TEXT_WIDTH_KEY, choice);
            },
          },
        ]),
      ),
    [width, pageless],
  );
  return { width, actions };
}
