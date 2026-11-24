'use client';

// Edit Cards in the Toolbar layout's strip (docs/specs/026-plan/item-types.md "The Card Types panel"):
// with the Cards category chosen, the strip ends, after a divider, with a button that opens the
// Card Types panel, as the Cards body in More ends with Edit Cards.
import { HoverCard, PencilIcon } from '@livedoc/ui';
import { TOOLBAR_CONTROL_REST } from '@/components/chrome/toolbar-surface';
import { openCardTypes } from '@/hooks/plan/card-types-opener';
import { track } from '@/lib/telemetry';

export function EditCardsStripButton() {
  return (
    <HoverCard
      title="Edit Cards"
      description="Add card types and choose the fields each one holds."
    >
      <button
        type="button"
        aria-label="Edit Cards"
        onClick={() => {
          track('Plan', 'Opened', 'EditCards');
          openCardTypes();
        }}
        className={`flex h-field shrink-0 items-center justify-center gap-2 rounded-control px-3 text-body transition focus-visible:outline-2 focus-visible:outline-brand-600 ${TOOLBAR_CONTROL_REST}`}
      >
        <PencilIcon />
        Edit Cards
      </button>
    </HoverCard>
  );
}
