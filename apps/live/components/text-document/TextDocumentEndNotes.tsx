// Footnotes under the writing where there are no pages (docs/specs/034-text-documents/page-layout.md "Footnotes",
// "Pageless"): a short rule, then each note in the order of its mark, led by its number; each box painted by its
// note's source (useTextDocumentStories).
import { NOTE_BOX_NUMBER_ATTRIBUTE } from '@/lib/text-document/text-document-footnotes';
import type { PageNote } from '@/lib/text-document/pagination/pagination-notes';
import { STORY_KEY_ATTRIBUTE } from './useTextDocumentStories';

export function TextDocumentEndNotes({ notes }: { notes: readonly PageNote[] }) {
  if (notes.length === 0) return null;
  return (
    <section aria-label="Footnotes" data-end-notes="" className="mt-8">
      <div aria-hidden="true" data-notes-rule="" className="mb-2 h-px w-1/3 bg-current" />
      <ol className="list-none p-0">
        {notes.map((note) => (
          <li
            key={note.key}
            data-story={note.story}
            {...{
              [STORY_KEY_ATTRIBUTE]: note.key,
              [NOTE_BOX_NUMBER_ATTRIBUTE]: String(note.number),
            }}
          />
        ))}
      </ol>
    </section>
  );
}
