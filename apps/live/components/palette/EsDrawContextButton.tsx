'use client';

import { HoverCard } from '@livedoc/ui';
import { ContextLoopIcon, type EsBoardControls } from './EventStormingBoardRows';
import { TOOLBAR_TRIGGER_TONE } from './PaletteDropdown';

// Draw Context in the Toolbar layout's strip (docs/specs/021-event-storming/candidate-contexts.md "Making one by
// hand"): the same control as the Event Storming category's board row, icon-only beside Add from Photo, pressed while
// its pen is armed. Renders nothing for someone who may not change contexts.
export function EsDrawContextButton({ controls }: { controls: EsBoardControls | undefined }) {
  if (!controls?.onDrawContext) return null;
  const on = controls.drawingContext === true;
  return (
    <HoverCard
      title="Draw Context"
      description={
        on
          ? 'Drag a loop round the notes. Esc to stop.'
          : 'Draw a loop round notes to group them into a candidate context.'
      }
    >
      <button
        type="button"
        aria-label="Draw Context"
        aria-pressed={on}
        data-context-pen-toggle=""
        onClick={controls.onDrawContext}
        className={`flex h-9 w-9 items-center justify-center rounded-md transition ${
          on
            ? 'bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100'
            : TOOLBAR_TRIGGER_TONE
        }`}
      >
        <ContextLoopIcon />
      </button>
    </HoverCard>
  );
}
