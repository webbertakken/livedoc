'use client';

// Find's All results (docs/specs/035-pdf-documents/reading-surface.md "Find"): the side panel on the right, every
// result in its line of text with the match marked, the bookmarks first and then by page ("Page 3", or its label);
// a press goes to it and makes it current.
import { useState } from 'react';
import type { PageInfo } from '@livedoc/pdf-documents';
import { OfficePanel } from '@/components/office/OfficePanel';
import {
  OFFICE_PANEL_WIDTH,
  clampPanelWidth,
  type OfficePanelSpec,
} from '@/lib/office/office-panels';
import type { PdfFindResult } from '@/lib/pdf-document/pdf-find';
import { FIND } from '@/lib/pdf-document/pdf-menus';
import type { PdfFind } from '@/lib/pdf-document/usePdfFind';

export const FIND_RESULTS_PANEL: OfficePanelSpec = {
  id: 'find-results',
  title: 'Find results',
  side: 'right',
  item: FIND,
};

type Group = { heading: string; results: { result: PdfFindResult; at: number }[] };

/** The results under their headings: the bookmarks first, then each page in order. */
export function findGroups(
  results: readonly PdfFindResult[],
  pages: readonly Pick<PageInfo, 'label'>[],
): Group[] {
  const groups = new Map<string, Group>();
  results.forEach((result, at) => {
    const heading =
      result.kind === 'bookmark'
        ? 'Bookmarks'
        : `Page ${pages[result.page]?.label ?? result.page + 1}`;
    const group = groups.get(heading) ?? { heading, results: [] };
    group.results.push({ result, at });
    groups.set(heading, group);
  });
  return [...groups.values()];
}

export function PdfFindResults({
  find,
  pages,
  focusNonce,
}: {
  find: PdfFind;
  pages: readonly PageInfo[];
  focusNonce: number;
}) {
  const [width, setWidth] = useState<number>(OFFICE_PANEL_WIDTH.initial);
  const results = find.progress?.results ?? [];
  return (
    <OfficePanel
      spec={FIND_RESULTS_PANEL}
      width={width}
      onWidth={(next) => setWidth(clampPanelWidth(next))}
      onClose={() => find.setListOpen(false)}
      focusNonce={focusNonce}
    >
      <p className="px-2 pb-2 text-xs text-(--office-muted)">{find.count}</p>
      <div>
        {findGroups(results, pages).map((group) => (
          <section key={group.heading} aria-label={group.heading} className="mb-2">
            <h3 className="px-2 py-1 text-xs font-semibold text-(--office-muted)">
              {group.heading}
            </h3>
            <ul className="grid gap-0.5">
              {group.results.map(({ result, at }) => (
                <li key={at}>
                  <button
                    type="button"
                    aria-current={at === find.current ? 'true' : undefined}
                    onClick={() => find.choose(at)}
                    className="w-full rounded px-2 py-1.5 text-left text-sm text-(--office-ink) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-current:bg-(--office-pressed) aria-current:text-(--office-pressed-ink)"
                  >
                    {result.snippet.before}
                    <mark className="bg-transparent font-semibold text-inherit underline decoration-(--office-focus) decoration-2 underline-offset-2">
                      {result.snippet.match}
                    </mark>
                    {result.snippet.after}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </OfficePanel>
  );
}
