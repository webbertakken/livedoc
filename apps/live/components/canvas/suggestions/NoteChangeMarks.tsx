'use client';

import type { Element } from '@livedoc/document';
import type { SuggestionControls } from '@/components/canvas/Canvas.types';
import { changeCaption, changeSummary } from '@/lib/change-caption';
import type { OfferedPreview } from '@/lib/change-preview';
import type { ChangeMark } from '@/lib/suggested-changes';
import {
  changeKey,
  endSuggestionPreview,
  leaveSuggestion,
  parsePreviewKey,
  previewSuggestion,
} from '@/lib/suggestion-view';
import { ChangeCaption } from './ChangeCaption';
import { NoteChangeMark } from './NoteChangeMark';
import { PlaceholderPaper } from './SuggestionPlaceholder';
import { suggestionStrokeVars } from './suggestion-colours';

// A board's note changes on the canvas (docs/specs/021-event-storming/suggested-changes.md "How a person sees and
// decides"): a mark on each note that holds any, and for the change being previewed its caption, a split's further
// parts as placeholders where they would land, and the strike through a note a removal would take. The previewed
// notes themselves are drawn by the element list, from the offered preview; nothing here writes.

const STRIKE_PX = 3;
const STRIKE_REACH_PX = 6;

export function NoteChangeMarks({
  elements,
  tabId,
  marks,
  previewKey,
  offered,
  zoom,
  controls,
}: {
  elements: readonly Element[];
  tabId: string;
  marks: readonly ChangeMark[];
  previewKey: string | null;
  // What the previewed change would make of the board: a split's parts and a removal's note are drawn here.
  offered: OfferedPreview | null;
  zoom: number;
  controls: SuggestionControls;
}) {
  const px = 1 / zoom;
  const previewed = parsePreviewKey(previewKey);
  const shown =
    previewed?.type === 'change' ? marks.find((m) => m.note.id === previewed.noteId) : undefined;
  const change = shown && previewed?.type === 'change' ? shown.changes[previewed.index] : undefined;
  const struck = offered?.struck ? marks.find((m) => m.note.id === offered.struck) : undefined;
  const decide = (act: () => void) => () => {
    endSuggestionPreview(tabId);
    act();
  };

  return (
    <>
      {marks.map((mark) => {
        const key = changeKey(mark.note.id);
        const first = mark.changes[0]!;
        return (
          <NoteChangeMark
            key={mark.note.id}
            mark={mark}
            zoom={zoom}
            onPreview={() => previewSuggestion(tabId, key)}
            onLeave={() => leaveSuggestion(tabId, key)}
            onAccept={decide(() => controls.acceptChange(mark.note.id, first))}
            onDismiss={decide(() => controls.dismissChange(mark.note.id, first))}
          />
        );
      })}
      {offered?.parts.map((part) => (
        <div
          key={part.id}
          aria-hidden
          data-change-part={part.words}
          className="pointer-events-none absolute"
          style={{
            left: part.spot.x,
            top: part.spot.y,
            width: part.spot.width,
            height: part.spot.height,
            ...suggestionStrokeVars(part.kind),
          }}
        >
          <PlaceholderPaper
            kind={part.kind}
            words={part.words}
            height={part.spot.height}
            zoom={zoom}
          />
        </div>
      ))}
      {struck ? (
        <div
          aria-hidden
          data-change-strike={struck.note.id}
          className="pointer-events-none absolute rounded-full [background-color:var(--suggestion-stroke-light)] dark:[background-color:var(--suggestion-stroke-dark)]"
          style={{
            left: struck.note.x - STRIKE_REACH_PX * px,
            top: struck.note.y + struck.note.height / 2 - (STRIKE_PX * px) / 2,
            width: struck.note.width + 2 * STRIKE_REACH_PX * px,
            height: STRIKE_PX * px,
            ...suggestionStrokeVars(struck.kind),
          }}
        />
      ) : null}
      {shown && change && previewed?.type === 'change' ? (
        <ChangeCaption
          caption={changeCaption(elements, shown.note.id, change)}
          summary={changeSummary(shown.note, change)}
          kind={shown.kind}
          anchor={shown.note}
          zoom={zoom}
          onAccept={decide(() => controls.acceptChange(shown.note.id, change))}
          onEverywhere={decide(() => controls.acceptChange(shown.note.id, change, 'board'))}
          onDismiss={decide(() => controls.dismissChange(shown.note.id, change))}
          onPreview={() => previewSuggestion(tabId, changeKey(shown.note.id, previewed.index))}
          onPreviewEverywhere={() =>
            previewSuggestion(tabId, changeKey(shown.note.id, previewed.index, 'board'))
          }
          onLeave={() => leaveSuggestion(tabId, previewKey!)}
        />
      ) : null}
    </>
  );
}
