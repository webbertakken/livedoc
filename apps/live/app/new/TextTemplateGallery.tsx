'use client';

// The text document template gallery as a page (docs/specs/034-text-documents/starting-and-finding.md "Where the
// gallery shows"): `/new?gallery=text-document`, where File > New > From template gallery leads, as Google's does. A
// Blank document card, then the gallery's sections, each card the template's whole first page and its name.
import {
  TEXT_TEMPLATE_SECTIONS,
  type TextDocumentTemplateId,
} from '@livedoc/text-documents/templates/gallery';
import { lucidePlus } from '@livedoc/icons/lucide';
import { lucideGlyph } from '@livedoc/ui';
import { TextTemplatePicture } from '@/lib/text-document/templates/TextTemplatePicture';
import { useTextTemplatePictures } from '@/lib/text-document/templates/useTextTemplatePictures';

const PlusIcon = lucideGlyph(lucidePlus, 40);

const CARD =
  'group block w-full rounded-menu text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-wait dark:focus-visible:outline-brand-400';
const PAGE =
  'block overflow-hidden rounded-control border border-slate-200 shadow-sm transition group-hover:border-brand-400 dark:border-slate-700 dark:group-hover:border-brand-400';
const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5';

export function TextTemplateGallery({
  busy,
  onChoose,
}: {
  busy: boolean;
  onChoose: (choice: TextDocumentTemplateId | 'blank') => void;
}) {
  const pictures = useTextTemplatePictures();
  return (
    // A solid ground over the wizard's animated backdrop: the pages are the picture here.
    <div className="absolute inset-0 z-10 overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:px-6">
        <h1 className="text-page-title text-slate-900 dark:text-slate-100">Template gallery</h1>
        <section aria-labelledby="text-gallery-start" className="mt-6">
          <h2 id="text-gallery-start" className="text-body text-slate-700 dark:text-slate-200">
            Start a new document
          </h2>
          <ul className={`mt-3 ${GRID}`}>
            <li>
              <button
                type="button"
                disabled={busy}
                onClick={() => onChoose('blank')}
                className={CARD}
              >
                <span className={PAGE}>
                  <span
                    aria-hidden
                    className="flex aspect-[17/22] w-full items-center justify-center bg-white text-brand-700 dark:bg-[#1e1f20] dark:text-brand-400"
                  >
                    <PlusIcon />
                  </span>
                </span>
                <span className="block pt-2 text-supporting text-slate-700 dark:text-slate-200">
                  Blank document
                </span>
              </button>
            </li>
          </ul>
        </section>
        {TEXT_TEMPLATE_SECTIONS.map((section) => (
          <section
            key={section.id}
            aria-labelledby={`text-gallery-${section.id}`}
            className="mt-10"
          >
            <h2
              id={`text-gallery-${section.id}`}
              className="text-body text-slate-700 dark:text-slate-200"
            >
              {section.name}
            </h2>
            <ul className={`mt-3 ${GRID}`}>
              {section.templates.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onChoose(template.id)}
                    className={CARD}
                  >
                    <span className={PAGE}>
                      <TextTemplatePicture picture={pictures?.get(template.id)} crop={false} />
                    </span>
                    <span className="block pt-2 text-supporting text-slate-700 dark:text-slate-200">
                      {template.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
