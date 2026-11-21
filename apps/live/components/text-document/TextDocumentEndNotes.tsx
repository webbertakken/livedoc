// Footnotes under the writing where there are no pages (docs/specs/034-text-documents/page-layout.md "Footnotes",
// "Pageless"): a short rule, then each note in the order of its mark, led by its number; each box painted by its
// note's source (useTextDocumentStories), the one being edited its source itself; a press on one enters it.
import type { PageNote } from '@/lib/text-document/pagination/pagination-notes';
import { NoteBox, type NoteBoxesProps } from './TextDocumentPageNotes';

export function TextDocumentEndNotes({
  notes,
  ...boxes
}: { notes: readonly PageNote[] } & NoteBoxesProps) {
  if (notes.length === 0) return null;
  return (
    <section aria-label="Footnotes" data-end-notes="" className="mt-8">
      <div aria-hidden="true" data-notes-rule="" className="mb-2 h-px w-1/3 bg-current" />
      <ol className="list-none p-0" onMouseDown={boxes.onPress}>
        {notes.map((note) => (
          <NoteBox key={note.key} as="li" note={note} editing={boxes.editing} box={boxes.box} />
        ))}
      </ol>
    </section>
  );
}
