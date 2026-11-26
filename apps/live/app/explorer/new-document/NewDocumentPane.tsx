'use client';

// The New Document menu's pane (docs/specs/013-workspace/new-document-menu.md "The menu"): every template of the
// selected blank, in its groups, three to a row, scrolling within the menu, each group's heading staying at the top while
// its templates pass under it. The blank itself is the list's row, so the pane holds templates only. Every card is a menu
// item; `data-spot` places it on the grid the menu's arrow keys walk (new-document-keys.ts).
import type { ReactNode } from 'react';
import { lucideFilePlus, lucideFileUp } from '@livedoc/icons/lucide';
import { lucideGlyph } from '@livedoc/ui';
import type { NewDocumentBlank, TemplateKind } from '@livedoc/templates';
import { BlankGlyph } from './blank-glyphs';
import { TemplatePicture } from '@/components/start/template-card';
import { templateOf } from '@/components/start/start-template-items';
import type { PaneGroup } from '@/lib/new-document/pane-groups';
import { paneSpots } from './new-document-keys';

export const spotAttr = (row: number, col: number) => `pane:${row}:${col}`;

/** The cards a document kind's pane holds: PDF document's Blank PDF and Open a PDF file, none for the others. */
export const kindPaneCards = (blank: NewDocumentBlank): number =>
  blank.kind === 'pdf-document' ? 2 : 0;

export function NewDocumentPane({
  blank,
  groups,
  onChoose,
  onChooseKind,
}: {
  blank: NewDocumentBlank;
  groups: readonly PaneGroup[];
  onChoose: (template: TemplateKind) => void;
  /** A kind's pane: its blank, or PDF document's Open a PDF file. */
  onChooseKind: (choice: 'blank' | 'file') => void;
}) {
  if (blank.kind) return <KindPane blank={blank} onChoose={onChooseKind} />;
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

// A document kind's pane, until its gallery has templates (new-document-menu.md "The blanks", D227): its glyph, its name
// and what it makes; PDF document's holds its two cards, Blank PDF and Open a PDF file, on the pane's first row.
function KindPane({
  blank,
  onChoose,
}: {
  blank: NewDocumentBlank;
  onChoose: (choice: 'blank' | 'file') => void;
}) {
  const pdf = blank.kind === 'pdf-document';
  return (
    <div
      role="group"
      aria-label={`${blank.name} templates`}
      className="flex h-full flex-col gap-3 px-3 pt-3"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-row shrink-0 items-center justify-center rounded-menu bg-slate-100 dark:bg-slate-800">
          <BlankGlyph id={blank.id} />
        </span>
        <div className="min-w-0">
          <h3 className="text-body text-slate-900 dark:text-slate-50">{blank.name}</h3>
          <p className="text-supporting text-slate-600 dark:text-slate-300">{blank.pitch}</p>
        </div>
      </div>
      {pdf ? (
        <div className="grid grid-cols-2 gap-2">
          <KindCard
            spot={spotAttr(0, 0)}
            label="Blank PDF"
            glyph={<FilePlusIcon />}
            onClick={() => onChoose('blank')}
          />
          <KindCard
            spot={spotAttr(0, 1)}
            label="Open a PDF file"
            glyph={<UploadIcon />}
            onClick={() => onChoose('file')}
          />
        </div>
      ) : null}
    </div>
  );
}

function KindCard({
  spot,
  label,
  glyph,
  onClick,
}: {
  spot: string;
  label: string;
  glyph: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      data-spot={spot}
      onClick={onClick}
      className="flex min-h-row items-center gap-2 rounded-menu border border-slate-200 bg-white px-3 py-2 text-left text-body text-slate-800 outline-none transition hover:border-brand-400 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:border-brand-400 dark:focus-visible:outline-brand-400"
    >
      <span aria-hidden className="flex shrink-0 text-slate-500 dark:text-slate-400">
        {glyph}
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

const FilePlusIcon = lucideGlyph(lucideFilePlus, 16);
const UploadIcon = lucideGlyph(lucideFileUp, 16);
