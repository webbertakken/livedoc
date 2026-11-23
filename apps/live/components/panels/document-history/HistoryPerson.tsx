'use client';

// Who did an event, as a disc (docs/specs/013-workspace/timeline.md §2.10): their initials in their
// stable colour, or the person glyph on the brand fill for the reader. Decorative: every entry
// names its person in words beside it.

import { IDENTITY_FILL, PictureDisc, identityVars, lucideGlyph } from '@livedoc/ui';
import { lucideUser } from '@livedoc/icons/lucide';
import { colorForKey, initialsOf } from '@/lib/identity';

const PersonGlyph = lucideGlyph(lucideUser, 12);

export function HistoryPerson({
  name,
  colourKey,
  mine,
  size,
  ring = false,
}: {
  // "You", their name or "Someone" (eventPersonName).
  name: string;
  // What tells them apart (eventPersonKey), so one person wears one colour throughout.
  colourKey: string;
  // The reader: the brand fill and the person glyph rather than their own initials.
  mine: boolean;
  size: number;
  ring?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 rounded-full ${ring ? 'ring-2 ring-white dark:ring-slate-900' : ''}`}
    >
      <PictureDisc
        as="span"
        pictureUrl={null}
        size={size}
        style={{
          ...(mine ? null : identityVars(colorForKey(colourKey))),
          fontSize: Math.round(size * 0.42),
        }}
        className={`text-white [&_svg]:h-[60%] [&_svg]:w-[60%] ${
          mine ? 'bg-brand-700 dark:bg-brand-600' : IDENTITY_FILL
        }`}
      >
        {mine ? <PersonGlyph /> : initialsOf(name)}
      </PictureDisc>
    </span>
  );
}
