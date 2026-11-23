'use client';

// The lens's text marked in each listed document's name (docs/specs/013-workspace/explorer-filters.md
// "Matching"). The Explorer pane provides the compiled text; a name outside it, or with nothing to mark,
// renders as plain text.

import { compileTitleQuery, matchTitle, type TitleQuery } from '@livedoc/explorer-lens';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

const TitleHighlightContext = createContext<TitleQuery | null>(null);

/** Marks the lens's text words in every HighlightedTitle below it. */
export function TitleHighlightProvider({
  text,
  children,
}: {
  text: readonly string[];
  children: ReactNode;
}) {
  const query = useMemo(() => compileTitleQuery(text), [text]);
  return (
    <TitleHighlightContext.Provider value={query.words.length > 0 ? query : null}>
      {children}
    </TitleHighlightContext.Provider>
  );
}

/** Underlined and bold as well as tinted, so a match never reads by colour alone. */
const MARK_CLASS =
  'rounded-none bg-brand-100 font-medium text-inherit underline decoration-brand-600 decoration-2 underline-offset-2 dark:bg-brand-500/25 dark:decoration-brand-300';

/** A document's name with the matched characters marked. A screen reader reads the plain name once:
 *  the marked copy is hidden from it. */
export function HighlightedTitle({ name }: { name: string }) {
  const query = useContext(TitleHighlightContext);
  const ranges = useMemo(
    () => (query ? (matchTitle(query, name)?.ranges ?? []) : []),
    [query, name],
  );
  if (ranges.length === 0) return <>{name}</>;
  const pieces: ReactNode[] = [];
  let at = 0;
  for (const { start, end } of ranges) {
    if (start > at) pieces.push(name.slice(at, start));
    pieces.push(
      <mark key={start} className={MARK_CLASS} data-title-match="">
        {name.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  if (at < name.length) pieces.push(name.slice(at));
  return (
    <>
      <span className="sr-only">{name}</span>
      <span aria-hidden="true">{pieces}</span>
    </>
  );
}
