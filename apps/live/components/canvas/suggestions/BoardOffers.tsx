'use client';

import { useEffect, useEffectEvent, useMemo } from 'react';
import { isBoxed, type Element, type ElementId, type Layer } from '@livedoc/document';
import type { SuggestionControls } from '@/components/canvas/Canvas.types';
import { arrangeRefusal, type BoardOffer } from '@/lib/board-offer';
import { arrangeRefusalWords, boardOfferLine } from '@/lib/board-offer-words';
import { stopArranging } from '@/lib/suggestion-view';
import { isTypingTarget } from '@/lib/typing-target';
import { BoardOfferBar } from './BoardOfferBar';

// A whole board rearranged, while a person looks at it (docs/specs/021-event-storming/lane-plans.md "How a person
// sees and decides", docs/specs/021-event-storming/arrange.md "How a person arranges"): the bar for a lane plan being
// pointed at, and for Arrange and Reorder its Keep and Put Back, or why the board was not arranged. The board itself
// is drawn by the element list, from the offered preview; nothing here writes but Keep. Arranging ends on Keep, Put
// Back, Escape, or a drag in hand: the board is the drag's while it lasts.

export function BoardOffers({
  tabId,
  elements,
  layers,
  offer,
  arranging,
  dragging,
  controls,
}: {
  tabId: string;
  elements: Element[];
  layers?: Layer[];
  // The board as the previewed lane plan, or arranging, would leave it; null when neither would.
  offer: BoardOffer | null;
  arranging: boolean;
  dragging: boolean;
  controls: SuggestionControls;
}) {
  const refusal = useMemo(
    () => (arranging && !offer ? arrangeRefusal({ elements, layers }) : null),
    [arranging, offer, elements, layers],
  );
  const putBack = () => stopArranging(tabId);

  useEffect(() => {
    if (arranging && dragging) stopArranging(tabId);
  }, [arranging, dragging, tabId]);

  // The view fits the board as it would be, once, as arranging starts.
  const fit = useEffectEvent(() => {
    if (offer) controls.reveal(offer.bounds);
  });
  useEffect(() => {
    if (arranging) fit();
  }, [arranging]);

  useEffect(() => {
    if (!arranging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isTypingTarget(e.target)) return;
      // Escape means Put Back while the bar shows, and nothing else.
      e.stopPropagation();
      stopArranging(tabId);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [arranging, tabId]);

  if (arranging && refusal) {
    const words = arrangeRefusalWords(refusal, elements);
    const show = (id: ElementId) => {
      const note = elements.find((el) => el.id === id);
      if (!note || !isBoxed(note)) return;
      controls.selectNote(id);
      controls.reveal(note);
    };
    return (
      <BoardOfferBar
        line={words.message}
        ways={words.ways}
        more={words.more}
        onWay={show}
        actions={[{ label: 'Close', onSelect: putBack }]}
      />
    );
  }
  if (!offer) return null;
  return (
    <BoardOfferBar
      line={boardOfferLine(offer)}
      actions={
        arranging
          ? [
              { label: 'Put Back', onSelect: putBack },
              { label: 'Keep', onSelect: controls.keepArranged, primary: true },
            ]
          : []
      }
    />
  );
}
