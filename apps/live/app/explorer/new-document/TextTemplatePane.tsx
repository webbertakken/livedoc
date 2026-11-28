'use client';

// Text document's pane in the New Document menu (docs/specs/034-text-documents/starting-and-finding.md "Where the
// gallery shows"): the template gallery's sections, each template a card showing the top of its first page and its
// name. Every card is a menu item placed on the grid the menu's arrow keys walk (new-document-keys.ts).
import {
  TEXT_TEMPLATE_SECTIONS,
  type TextDocumentTemplateId,
} from '@livedoc/text-documents/templates/gallery';
import { TextTemplatePicture } from '@/lib/text-document/templates/TextTemplatePicture';
import { useTextTemplatePictures } from '@/lib/text-document/templates/useTextTemplatePictures';
import { paneSpots } from './new-document-keys';

/** How many cards each of the pane's rows of sections holds, for the menu's keys. */
export const TEXT_TEMPLATE_PANE_COUNTS: readonly number[] = TEXT_TEMPLATE_SECTIONS.map(
  (section) => section.templates.length,
);

export function TextTemplatePane({
  spotAttr,
  onChoose,
}: {
  spotAttr: (row: number, col: number) => string;
  onChoose: (id: TextDocumentTemplateId) => void;
}) {
  const pictures = useTextTemplatePictures();
  const spots = paneSpots(TEXT_TEMPLATE_PANE_COUNTS);
  return (
    <div className="relative h-full min-w-0">
      <div
        data-pane-scroll=""
        role="group"
        aria-label="Text document templates"
        className="absolute inset-0 overflow-y-auto overscroll-contain px-3 pb-6"
      >
        {TEXT_TEMPLATE_SECTIONS.map((section, g) => (
          <section
            key={section.id}
            aria-labelledby={`new-document-group-text-document-${section.id}`}
            className={g ? 'mt-2' : ''}
          >
            <h3
              id={`new-document-group-text-document-${section.id}`}
              className="sticky top-0 z-10 -mx-3 bg-white/95 px-3 pb-1.5 pt-3 text-supporting text-slate-500 backdrop-blur-sm dark:bg-slate-900/95 dark:text-slate-400"
            >
              {section.name}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {section.templates.map((template, i) => (
                <button
                  key={template.id}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  data-spot={spotAttr(spots[g]![i]!.row, spots[g]![i]!.col)}
                  onClick={() => onChoose(template.id)}
                  className="scroll-mt-9 rounded-menu border border-slate-200 bg-white p-1 text-left outline-none transition hover:border-brand-400 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-brand-400 dark:focus-visible:outline-brand-400"
                >
                  <span className="block h-14 overflow-hidden rounded-control border border-slate-100 dark:border-slate-700">
                    <TextTemplatePicture picture={pictures?.get(template.id)} crop />
                  </span>
                  <span className="block truncate px-1 pt-1 text-supporting text-slate-700 dark:text-slate-200">
                    {template.name}
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
