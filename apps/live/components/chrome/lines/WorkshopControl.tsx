'use client';

import { FlipchartIcon, HoverCard } from '@livedoc/ui';
import {
  TOOLBAR_BUTTON,
  TOOLBAR_BUTTON_ON,
  TOOLBAR_ICON_BUTTON,
  TOOLBAR_SQUARE_ON_PHONE,
} from '@/components/chrome/toolbar-surface';

// The Workshop control (docs/specs/012-collaboration/workshop-mode.md "The control"): the actions group's flat button,
// a toggle that brings the session kit (the Session strip, the Collaborate categories and Stickers) into the tab's
// mode. Its label never changes, so turning it moves nothing; the brand fill (Share's, for a shared document) and
// aria-pressed carry the state. Like Search and Settings it is its mark alone, named by its hover card, unless Button
// Labels is on (`labelled`, never on a phone), so the top line keeps its room and its strip centred
// (docs/specs/012-collaboration/workshop-mode.md "The control"). Shown only
// where an Editor may turn it (the caller gates on the mode switch's own gate).
export function WorkshopControl({
  on,
  onToggle,
  labelled = false,
}: {
  on: boolean;
  onToggle: (on: boolean) => void;
  labelled?: boolean;
}) {
  return (
    <HoverCard
      title="Workshop"
      description={
        on
          ? 'Put the session kit away. Anything on the canvas stays.'
          : 'Bring the session kit to this tab: timers, votes, polls and the Collaborate tiles.'
      }
    >
      <button
        type="button"
        data-workshop-control=""
        data-tour-id="workshop-control"
        aria-pressed={on}
        onClick={() => onToggle(!on)}
        className={`${labelled ? `${TOOLBAR_BUTTON} ${TOOLBAR_SQUARE_ON_PHONE}` : TOOLBAR_ICON_BUTTON} ${on ? TOOLBAR_BUTTON_ON : ''}`}
      >
        <FlipchartIcon size={14} aria-hidden />
        <span className={`text-optical-centre ${labelled ? 'phone:sr-only' : 'sr-only'}`}>
          Workshop
        </span>
      </button>
    </HoverCard>
  );
}
