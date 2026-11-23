'use client';

// The New Document menu's pane (docs/specs/013-workspace/new-document-menu.md "The menu"): every template of the
// selected blank, in its groups, three to a row, scrolling within the menu, each group's heading staying at the top while
// its templates pass under it. The blank itself is the list's row, so the pane holds templates only. Every card is a menu
// item; `data-spot` places it on the grid the menu's arrow keys walk (new-document-keys.ts).
import type { NewDocumentBlank, TemplateKind } from '@livedoc/templates';
import { TemplatePicture } from '@/components/start/template-card';
import { templateOf } from '@/components/start/start-template-items';
import type { PaneGroup } from '@/lib/new-document/pane-groups';
import { paneSpots } from './new-document-keys';

export const spotAttr = (row: number, col: number) => `pane:${row}:${col}`;

export function NewDocumentPane({
  blank,
  groups,
  onChoose,
}: {
  blank: NewDocumentBlank;
  groups: readonly PaneGroup[];
  onChoose: (template: TemplateKind) => void;
}) {
  const spots = paneSpots(groups.map((g) => g.kinds.length));
  return (
    <div className="relative h-full min-w-0">
      <div
        data-pane-scroll=""
        role="group"
        aria-label={`${blank.name} templates`}
        className="absolute inset-0 overflow-y-auto overscroll-contain px-3 pb-6"
      >
        {groups.map((group, g) => (
          <section
            key={group.id}
            aria-labelledby={`new-document-group-${blank.id}-${group.id}`}
            className={g ? 'mt-2' : ''}
          >
            <h3
              id={`new-document-group-${blank.id}-${group.id}`}
              className="sticky top-0 z-10 -mx-3 bg-white/95 px-3 pb-1.5 pt-3 text-supporting text-slate-500 backdrop-blur-sm dark:bg-slate-900/95 dark:text-slate-400"
            >
              {group.name}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {group.kinds.map((kind, i) => (
                <button
                  key={kind}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  data-spot={spotAttr(spots[g]![i]!.row, spots[g]![i]!.col)}
                  onClick={() => onChoose(kind)}
                  className="scroll-mt-9 rounded-menu border border-slate-200 bg-white p-1 text-left outline-none transition hover:border-brand-400 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-brand-400 dark:focus-visible:outline-brand-400"
                >
                  <span className="block h-14 overflow-hidden rounded-control">
                    <TemplatePicture kind={kind} />
                  </span>
                  <span className="block truncate px-1 pt-1 text-supporting text-slate-700 dark:text-slate-200">
                    {templateOf(kind).title}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      {/* A soft fade says there is more below. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent dark:from-slate-900"
      />
    </div>
  );
}
