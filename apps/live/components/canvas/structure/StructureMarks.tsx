'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  answerOf,
  eventStormingKindOf,
  hiddenLayerElementIds,
  isSuggestion,
  type Element,
  type ElementId,
  type Layer,
  type StickyElement,
} from '@livedoc/document';
import { useCanvasZoom } from '@/components/canvas/CanvasZoomContext';
import { applyOverlay, useDragPreview } from '@/lib/drag-preview';
import { closeAnswer, openAnswer, useStructureView } from '@/lib/structure-view';
import { AnswerField } from './AnswerField';
import { ANSWER_MARK_TARGET_PX, AnswerMark } from './AnswerMark';
import { NoteCallout } from './NoteCallout';

// What a hotspot's answer shows on the canvas (docs/specs/021-event-storming/board-structure.md "Hotspot answers"),
// over the notes and at screen size: the check on each answered hotspot, the answer as a caption while the check is
// pointed at or focused, and the field the answer is typed in. Everyone sees the checks and the captions; the field
// is drawn only for whoever may answer (`onAnswer`). Drawn from the notes as they are drawn now, so a check follows
// its note in hand. A field put away by a key hands the keyboard back: to what opened it while that still stands,
// else to the note's check, so it never falls to the page.

// How far the disc's centre stands in from the note's top right corner, screen px.
const MARK_INSET_PX = 4;

export function StructureMarks({
  tabId,
  elements,
  layers,
  onAnswer,
}: {
  tabId: string;
  elements: Element[];
  // The tab's layers: a hotspot on a hidden layer wears no check.
  layers?: Layer[];
  // Keeps a hotspot's answer. Absent for whoever may not answer: nothing opens for typing.
  onAnswer?: (id: ElementId, text: string) => void;
}) {
  const zoom = useCanvasZoom();
  const overlay = useDragPreview(tabId, elements);
  const { answeringId } = useStructureView(tabId);
  const [shownId, setShownId] = useState<ElementId | null>(null);
  const hotspots = useMemo(() => {
    const drawn = overlay ? applyOverlay(elements, overlay) : elements;
    const off = hiddenLayerElementIds(drawn, layers);
    return drawn.filter(
      (el): el is StickyElement =>
        el.type === 'sticky' &&
        eventStormingKindOf(el) === 'hotspot' &&
        !isSuggestion(el) &&
        !off.has(el.id),
    );
  }, [elements, overlay, layers]);
  const answering =
    onAnswer && answeringId ? (hotspots.find((h) => h.id === answeringId) ?? null) : null;
  // The field goes with its note: deleted, changed to another kind, hidden, or no longer this person's to answer.
  useEffect(() => {
    if (answeringId && !answering) closeAnswer(tabId);
  }, [tabId, answeringId, answering]);
  // And with its board.
  useEffect(() => () => closeAnswer(tabId), [tabId]);
  const handBack = useRef<{ noteId: ElementId; opener: HTMLElement | null } | null>(null);
  useEffect(() => {
    const back = handBack.current;
    if (!back || answeringId) return;
    handBack.current = null;
    const to = back.opener?.isConnected
      ? back.opener
      : document.querySelector<HTMLElement>(`[data-answer-mark="${CSS.escape(back.noteId)}"]`);
    to?.focus({ preventScroll: true });
  }, [answeringId]);
  const answered = hotspots.filter((h) => answerOf(h) !== '');
  const shown =
    shownId && shownId !== answering?.id ? answered.find((h) => h.id === shownId) : null;
  if (answered.length === 0 && !answering) return null;
  const half = ANSWER_MARK_TARGET_PX / 2;
  return (
    <>
      {answered.map((h) => (
        <div
          key={h.id}
          className="absolute"
          style={{
            left: h.x + h.width,
            top: h.y,
            transform: `scale(${1 / zoom})`,
            transformOrigin: '0 0',
          }}
        >
          <div
            className="absolute"
            style={{ left: -MARK_INSET_PX - half, top: MARK_INSET_PX - half }}
          >
            <AnswerMark
              noteId={h.id}
              answer={answerOf(h)}
              onOpen={onAnswer ? () => openAnswer(tabId, h.id) : undefined}
              onShow={() => setShownId(h.id)}
              onHide={() => setShownId((id) => (id === h.id ? null : id))}
            />
          </div>
        </div>
      ))}
      {shown ? (
        <NoteCallout anchor={shown}>
          <AnswerCaption answer={answerOf(shown)} />
        </NoteCallout>
      ) : null}
      {answering && onAnswer ? (
        <NoteCallout key={answering.id} anchor={answering}>
          <AnswerField
            question={(answering.label ?? '').trim()}
            answer={answerOf(answering)}
            onKeyEnd={(opener) => {
              handBack.current = { noteId: answering.id, opener };
            }}
            onKeep={(text) => {
              onAnswer(answering.id, text);
              closeAnswer(tabId);
            }}
            onLeave={() => closeAnswer(tabId)}
          />
        </NoteCallout>
      ) : null}
    </>
  );
}

// The answer as a caption. The check's own name says it, so the caption is for the eye.
function AnswerCaption({ answer }: { answer: string }) {
  return (
    <div
      aria-hidden
      data-answer-caption
      className="pointer-events-none rounded-md border border-slate-200 bg-white px-3 py-2.5 text-[13px] leading-snug text-slate-700 shadow-md shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:shadow-slate-950/40"
    >
      <p className="mb-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
        Answer
      </p>
      <p className="break-words">{answer}</p>
    </div>
  );
}
