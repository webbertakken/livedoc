// Each page's footnotes (docs/specs/034-text-documents/page-layout.md "Footnotes", "Drawn", "Editing a note"): at the
// foot of its text area under a short rule, each led by its number, above the writing so a press reaches them. Each
// note's box is painted with a copy of its writing (useTextDocumentStories) and never read; the note being edited is
// its source itself, in its place, its number drawn before its first paragraph.
import type { CSSProperties, MouseEvent } from 'react';
import { NOTES_GAP_PX } from '@livedoc/text-documents';
import type { PageGeometry } from '@/lib/text-document/pagination/pagination-draw';
import type { PageNote } from '@/lib/text-document/pagination/pagination-notes';
import { NOTE_BOX_NUMBER_ATTRIBUTE } from '@/lib/text-document/text-document-footnotes';
import { pageTops, sheetsFrame } from './TextDocumentSheets';
import { STORY_KEY_ATTRIBUTE } from './useTextDocumentStories';

/** The note being edited: which, and the number it is drawn with. */
export type EditedNote = { readonly story: string; readonly number: number };

export type NoteBoxesProps = {
  /** The note being edited, drawn as its source in `box`. */
  readonly editing?: EditedNote | null;
  readonly box?: (element: HTMLElement | null) => void;
  /** A press on a drawn note. */
  readonly onPress?: (event: MouseEvent<HTMLElement>) => void;
};

/** A note's box: painted with its copy, or the edited one's source with its number before it. */
export function NoteBox({
  note,
  editing,
  box,
  as: Tag = 'div',
}: { note: PageNote; as?: 'div' | 'li' } & Omit<NoteBoxesProps, 'onPress'>) {
  if (editing?.story === note.story)
    return (
      <Tag
        ref={box}
        data-note-editing=""
        data-story={note.story}
        className="text-document-note-editing"
        style={{ '--note-number': `"${editing.number}"` } as CSSProperties}
      />
    );
  return (
    <Tag
      // Copies on the pages are never read; the list under the writing is (its notes' text).
      aria-hidden={Tag === 'div' ? 'true' : undefined}
      data-story={note.story}
      className="cursor-text"
      {...{
        [STORY_KEY_ATTRIBUTE]: note.key,
        [NOTE_BOX_NUMBER_ATTRIBUTE]: String(note.number),
      }}
    />
  );
}

/** A page's notes from the foot of its text area up: the rule, then each note's box. */
function PageNotes({
  notes,
  bottom,
  ...boxes
}: { notes: readonly PageNote[]; bottom: number } & NoteBoxesProps) {
  const first = notes[0]!;
  return (
    <div
      data-page-notes=""
      className="pointer-events-auto absolute flex flex-col"
      style={{ left: first.left, width: first.width, bottom }}
      onMouseDown={boxes.onPress}
    >
      <div aria-hidden="true" className="flex items-center" style={{ height: NOTES_GAP_PX }}>
        <div data-notes-rule="" className="h-px w-1/3 bg-current" />
      </div>
      {notes.map((note) => (
        <NoteBox key={note.key + note.number} note={note} editing={boxes.editing} box={boxes.box} />
      ))}
    </div>
  );
}

/** The pages' notes, each page's at its foot, laid over the pages where the sheets are. */
export function TextDocumentPageNotes({
  pages,
  ...boxes
}: { pages: readonly PageGeometry[] | null } & NoteBoxesProps) {
  const frame = sheetsFrame(pages);
  if (!pages || !frame || !pages.some((page) => page.notes?.length)) return null;
  const tops = pageTops(pages);
  return (
    <div data-pages-notes="" className="pointer-events-none absolute inset-0">
      {pages.map((page, index) =>
        page.notes?.length ? (
          <div
            key={index}
            data-page-notes-of={index + 1}
            className="absolute"
            style={{
              top: tops[index],
              left: (frame.width - page.width) / 2,
              width: page.width,
              height: page.height,
            }}
          >
            <PageNotes notes={page.notes} bottom={page.bottom ?? 0} {...boxes} />
          </div>
        ) : null,
      )}
    </div>
  );
}
