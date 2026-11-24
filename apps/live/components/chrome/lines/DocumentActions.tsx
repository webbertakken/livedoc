'use client';

import { Glyph, HoverCard } from '@livedoc/ui';
import { useFormShareHost } from '@/lib/form-share-store';
import {
  TOOLBAR_BUTTON,
  TOOLBAR_BUTTON_ON,
  TOOLBAR_SQUARE_ON_PHONE,
} from '@/components/chrome/toolbar-surface';
import { WorkshopControl } from './WorkshopControl';

// The present button's deck (docs/specs/012-collaboration/presentation-mode.md "The header's Present button"): given
// only while the deck has a presentable slide, so absent means no button.
export type PresentAction = { slideCount: number; starting: boolean; onPresent: () => void };

export type DocumentActionsProps = {
  // The Workshop control (docs/specs/012-collaboration/workshop-mode.md), given only where an Editor may turn it.
  workshop?: { on: boolean; onToggle: (on: boolean) => void } | undefined;
  // Button Labels (docs/specs/007-editor/user-preferences.md): the Workshop control shows its name beside its mark.
  labelled?: boolean;
  // Make a Copy, for a visitor (someone who may not share): the same slot as Share, a different action.
  onMakeCopy?: () => void;
  copying?: boolean;
  present?: PresentAction;
  // Share, for the owner or a team member (canShareDocument).
  showShare: boolean;
  shareable: boolean;
  onOpenShare: () => void;
};

// A shared document's Share, and a published form's Share Form: the brand fill, so the state reads at a glance.
const SHARED = TOOLBAR_BUTTON_ON;

// A label: the name beside the icon, read out only on a phone, whose top line has no room for it.
const LABEL = 'text-optical-centre phone:sr-only';

// The document actions in the actions group (docs/specs/007-editor/toolbar-layout.md "The top line"): the Workshop
// control, Make a Copy, Present, then Share or Share Form, each the group's flat button with its name.
export function DocumentActions({
  workshop,
  labelled = false,
  onMakeCopy,
  copying = false,
  present,
  showShare,
  shareable,
  onOpenShare,
}: DocumentActionsProps) {
  const formShare = useFormShareHost();
  return (
    <>
      {workshop ? (
        <WorkshopControl on={workshop.on} onToggle={workshop.onToggle} labelled={labelled} />
      ) : null}
      {onMakeCopy ? (
        <HoverCard title="Make a copy" description="Duplicate this document into your own files.">
          <button
            type="button"
            onClick={onMakeCopy}
            disabled={copying}
            className={`${TOOLBAR_BUTTON} ${TOOLBAR_SQUARE_ON_PHONE} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <CopyIcon />
            <span className={LABEL}>{copying ? 'Copying' : 'Copy'}</span>
          </button>
        </HoverCard>
      ) : null}
      {present ? (
        <HoverCard
          title="Present"
          description={`Present the slide deck: ${present.slideCount} ${
            present.slideCount === 1 ? 'slide' : 'slides'
          }.`}
        >
          <button
            type="button"
            onClick={present.onPresent}
            disabled={present.starting}
            data-presentation-start="header"
            className={`${TOOLBAR_BUTTON} ${TOOLBAR_SQUARE_ON_PHONE} disabled:cursor-wait disabled:opacity-60`}
          >
            <PresentIcon />
            <span className={LABEL}>{present.starting ? 'Starting' : 'Present'}</span>
          </button>
        </HoverCard>
      ) : null}
      {formShare ? (
        // On a Form tab an Editor's Share is the form's (lib/form-share-store.ts): one share button, never two.
        <HoverCard
          title="Share Form"
          description={
            formShare.published
              ? 'Copy the form’s link, or close it.'
              : 'Publish the form and copy its link.'
          }
        >
          <button
            type="button"
            data-tour-id="share-form"
            onClick={formShare.open}
            aria-pressed={formShare.published}
            className={`${TOOLBAR_BUTTON} ${TOOLBAR_SQUARE_ON_PHONE} ${formShare.published ? SHARED : ''}`}
          >
            <ShareIcon />
            <span className={LABEL}>Share Form</span>
          </button>
        </HoverCard>
      ) : showShare ? (
        <HoverCard
          title={shareable ? 'Shared' : 'Share'}
          description={shareable ? 'Click to manage links.' : 'Invite collaborators with a link.'}
        >
          <button
            type="button"
            data-tour-id="share"
            onClick={onOpenShare}
            aria-pressed={shareable}
            className={`${TOOLBAR_BUTTON} ${TOOLBAR_SQUARE_ON_PHONE} ${shareable ? SHARED : ''}`}
          >
            <ShareIcon />
            {/* "Share" in both states: the fill, aria-pressed and the share-state icon by the name carry the state. */}
            <span className={LABEL}>Share</span>
          </button>
        </HoverCard>
      ) : null}
    </>
  );
}

function CopyIcon() {
  return (
    <Glyph size={14} units={16}>
      <rect x="5" y="5" width="8" height="8.5" rx="1.5" />
      <path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H10" />
    </Glyph>
  );
}

function PresentIcon() {
  return (
    <Glyph size={14} units={16}>
      <path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.4-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5Z" />
    </Glyph>
  );
}

function ShareIcon() {
  return (
    <Glyph size={14} units={16}>
      <circle cx="4" cy="8" r="1.6" />
      <circle cx="12" cy="3.5" r="1.6" />
      <circle cx="12" cy="12.5" r="1.6" />
      <path d="M5.4 7.2l5.2-3M5.4 8.8l5.2 3" />
    </Glyph>
  );
}
