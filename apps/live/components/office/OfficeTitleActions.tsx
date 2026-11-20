'use client';

// The right of the office title row (docs/specs/034-text-documents/editing-surface.md "The title row"): Settings,
// Share or Make a copy, the people here, and the account at the far right, as Google places its account picture.
import type { ReactNode } from 'react';
import { HoverCard } from '@livedoc/ui';
import { AuthControls } from '@/components/chrome/AuthControls';
import type { OfficeChrome, OfficePerson } from './office-chrome';
import { OfficeCopyIcon, OfficeLockIcon, OfficeSettingsIcon } from './office-icons';
import { OfficePeople } from './OfficePeople';

// A round icon button of the title row: 32 px, 44 px reach on touch.
export const OFFICE_ICON_BUTTON =
  'flex size-8 shrink-0 items-center justify-center rounded-full text-(--office-icon) outline-none touch-target hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-pressed:text-(--office-ink)';

const PILL =
  'flex h-10 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:ring-offset-2 focus-visible:ring-offset-(--office-chrome) disabled:cursor-wait disabled:opacity-60';

export function OfficeIconButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <HoverCard title={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        className={OFFICE_ICON_BUTTON}
      >
        {children}
      </button>
    </HoverCard>
  );
}

export function OfficeTitleActions({
  chrome,
  onFollow,
}: {
  chrome: OfficeChrome;
  onFollow: (person: OfficePerson) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <OfficeIconButton label="Settings" onClick={chrome.onOpenSettings}>
        <OfficeSettingsIcon />
      </OfficeIconButton>
      {chrome.share ? (
        <HoverCard
          title={chrome.share.shareable ? 'Shared' : 'Private to you'}
          description={
            chrome.share.shareable ? 'Manage its links.' : 'Invite collaborators with a link.'
          }
        >
          <button
            type="button"
            data-office-share=""
            onClick={chrome.share.onOpen}
            className={`${PILL} bg-(--office-share) text-(--office-share-ink) hover:brightness-95`}
          >
            {chrome.share.shareable ? null : <OfficeLockIcon />}
            Share
          </button>
        </HoverCard>
      ) : chrome.makeCopy ? (
        <HoverCard title="Make a copy" description="Copy this document into your own files.">
          <button
            type="button"
            onClick={chrome.makeCopy.run}
            disabled={chrome.makeCopy.copying}
            className={`${PILL} border border-(--office-line) text-(--office-ink) hover:bg-(--office-hover)`}
          >
            <OfficeCopyIcon />
            {chrome.makeCopy.copying ? 'Copying' : 'Make a copy'}
          </button>
        </HoverCard>
      ) : null}
      <OfficePeople people={chrome.people} onFollow={onFollow} />
      <AuthControls onOpenAccount={chrome.onOpenAccount} />
    </div>
  );
}
