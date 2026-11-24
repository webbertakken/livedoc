'use client';

// Presence in the office title row (docs/specs/034-text-documents/editing-surface.md "The title row"): everyone else
// in the document, up to OFFICE_PEOPLE_SHOWN avatars, then "+n" opening the rest. A press on one follows them: their
// caret into view on this tab, or the tab they are on.
import { useRef, useState } from 'react';
import { HoverCard, useClickOutside, useEscape } from '@livedoc/ui';
import { ParticipantAvatar } from '@/components/primitives/ParticipantAvatar';
import type { OfficePerson } from './office-chrome';

/** (default) Google's: four avatars, then a count. */
export const OFFICE_PEOPLE_SHOWN = 4;

const AVATAR_PX = 28;
const RING = 'rounded-full outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)';

export function OfficePeople({
  people,
  onFollow,
}: {
  people: readonly OfficePerson[];
  onFollow: (person: OfficePerson) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const more = useRef<HTMLDivElement>(null);
  useClickOutside(more, () => setMoreOpen(false), moreOpen);
  useEscape(() => setMoreOpen(false), { enabled: moreOpen });
  if (people.length === 0) return null;
  const shown = people.slice(0, OFFICE_PEOPLE_SHOWN);
  const rest = people.slice(OFFICE_PEOPLE_SHOWN);
  return (
    <div role="group" aria-label="People here" className="flex items-center gap-2 px-1">
      {shown.map((person) => (
        <HoverCard key={person.participant.id} title={person.participant.name}>
          <button
            type="button"
            aria-label={person.participant.name}
            data-office-person=""
            onClick={() => onFollow(person)}
            className={`relative touch-target ${RING}`}
          >
            <ParticipantAvatar participant={person.participant} size={AVATAR_PX} />
          </button>
        </HoverCard>
      ))}
      {rest.length > 0 ? (
        <div ref={more} className="relative">
          <button
            type="button"
            aria-label={`${rest.length} more ${rest.length === 1 ? 'person' : 'people'}`}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
            className={`relative flex size-7 items-center justify-center bg-(--office-hover) text-supporting font-medium text-(--office-ink) touch-target ${RING}`}
          >
            +{rest.length}
          </button>
          {moreOpen ? (
            <ul className="absolute top-full right-0 z-30 mt-1 min-w-48 rounded-control bg-(--office-menu) py-1 text-body text-(--office-ink) shadow-lg">
              {rest.map((person) => (
                <li key={person.participant.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      onFollow(person);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left outline-none hover:bg-(--office-menu-hover) focus-visible:bg-(--office-menu-hover)"
                  >
                    <ParticipantAvatar participant={person.participant} size={20} />
                    <span className="truncate">{person.participant.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
