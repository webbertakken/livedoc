// Custom Currencies' workings (docs/specs/029-sheets/formatting.md "Number formats", D195): the currencies the browser
// knows, named in the workbook's locale, a search over them, and each one's formats as codes. Pure.

export type Currency = { code: string; name: string; symbol: string };

const LISTS = new Map<string, readonly Currency[]>();

// A currency's narrow symbol in the locale (€, $, ¥): a currency format always draws one, its code at the least.
function symbolOf(code: string, locale: string): string {
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    currencyDisplay: 'narrowSymbol',
  }).formatToParts(1);
  return parts.find((part) => part.type === 'currency')!.value;
}

/** Every currency the browser knows, its name in `locale`, sorted by name; worked out once per locale. */
export function currencyList(locale: string): readonly Currency[] {
  const known = LISTS.get(locale);
  if (known) return known;
  const names = new Intl.DisplayNames(locale, { type: 'currency' });
  const list = Intl.supportedValuesOf('currency')
    // A known code always has a name: DisplayNames falls back to the code itself.
    .map((code) => ({ code, name: names.of(code)!, symbol: symbolOf(code, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  LISTS.set(locale, list);
  return list;
}

/** The currencies whose name, code or symbol holds the query, any case; all of them for none. */
export function currencyMatches(list: readonly Currency[], query: string): readonly Currency[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((c) =>
    [c.name, c.code, c.symbol].some((text) => text.toLowerCase().includes(q)),
  );
}

// A symbol as a code's literal: quoted, or each character escaped when it holds a quote.
const literal = (text: string) =>
  text.includes('"') ? [...text].map((ch) => `\\${ch}`).join('') : `"${text}"`;

/** A currency's formats (D195): the symbol before or after, with two decimals or none. */
export function currencyFormats(symbol: string): { code: string }[] {
  const sym = literal(symbol);
  return [
    { code: `${sym}#,##0.00` },
    { code: `${sym}#,##0` },
    { code: `#,##0.00${sym}` },
    { code: `#,##0${sym}` },
  ];
}
