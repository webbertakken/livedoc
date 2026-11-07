'use client';

// Settings > Account's Colour (docs/specs/014-identity/auth-and-guest-access.md "Account settings"): the
// colour collaborators see on this person's cursor, avatar and name tag, chosen in place
// with the Row skin of the one colour picker (docs/specs/004-interface-design/colour-picker.md), from the ten
// presence colours only. A pick shows at once (here, on the profile card and in an open editor), then saves the
// participant record; refused, it puts back what the server last took, newest wins.
import { useRef, useState } from 'react';
import { ColourPopover } from '@/components/colour/ColourPopover';
import { SwatchChip } from '@/components/colour/ColourSwatch';
import type { ColourOption } from '@/components/colour/colour-options';
import { ChevronIcon } from '@/components/primitives/ChevronIcon';
import { useDeferredAuth } from '@/components/providers/deferred-auth';
import { apiSaveSelf } from '@/lib/api/self';
import { PARTICIPANT_COLORS, randomName, type Participant } from '@/lib/identity';
import { announceSelfColour, presenceColourName } from '@/lib/self-presence';
import { track } from '@/lib/telemetry';
import { SettingsRowShell } from './SettingsRowShell';
import type { SettingsPresenceColourRowSpec } from './settings-catalogue';
import { useSelfPresence } from './useSelfPresence';

export const COLOUR_FAILED = "Couldn't save your colour. Try again.";
// No colour chosen yet: one is given when the person first opens a document.
export const AUTOMATIC = 'Automatic';

const PRESENCE_OPTIONS: readonly ColourOption[] = PARTICIPANT_COLORS.map((colour) => ({
  id: colour,
  colour,
  label: presenceColourName(colour),
}));
const PRESENCE_GROUP = [{ heading: 'Presence Colours', options: PRESENCE_OPTIONS }];

export function SettingsPresenceColourRow({ row }: { row: SettingsPresenceColourRowSpec }) {
  const presence = useSelfPresence();
  const { user } = useDeferredAuth();
  const loaded = presence.state === 'ready' ? presence.self : null;
  // Who a pick is saved for: the record, or, before the first document made one, a new record for this account.
  const base: Participant | null =
    loaded ??
    (presence.state === 'none' && presence.id
      ? {
          id: presence.id,
          name: user?.name ?? user?.email ?? randomName(),
          color: '',
          status: 'online',
        }
      : null);
  const [open, setOpen] = useState(false);
  // The trigger, held in state (a callback ref) so the popover can anchor to it during render.
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const [failed, setFailed] = useState(false);
  // The newest pick's turn, and the colour the server last took with the turn that took it: a refusal puts that
  // back, and only when no newer pick has gone since. The colour shown before a pick is not it while an earlier
  // pick is still on its way, so two refusals in a row could leave a colour the server never stored.
  const latest = useRef(0);
  const confirmed = useRef<{ turn: number; colour: string | null } | null>(null);
  const colour = loaded?.color ?? null;

  const choose = async (self: Participant, next: string) => {
    confirmed.current ??= { turn: 0, colour: self.color || null };
    const turn = ++latest.current;
    setFailed(false);
    track('UI', 'Changed', 'PresenceColour');
    announceSelfColour(self.id, next);
    try {
      await apiSaveSelf({ ...self, color: next });
      if (turn > confirmed.current.turn) confirmed.current = { turn, colour: next };
    } catch (err) {
      console.warn('[settings] saving your colour failed', err);
      if (latest.current !== turn) return;
      announceSelfColour(self.id, confirmed.current.colour);
      setFailed(true);
    }
  };

  const label = colour
    ? presenceColourName(colour)
    : presence.state === 'loading'
      ? '…'
      : AUTOMATIC;
  return (
    <SettingsRowShell
      row={row}
      control={
        <button
          ref={setTrigger}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Colour: ${label}`}
          disabled={!base}
          onClick={() => setOpen(!open)}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-default disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/60"
        >
          {colour ? <SwatchChip colour={colour} small /> : null}
          {label}
          <ChevronIcon open={open} className="text-slate-400" />
        </button>
      }
    >
      {open && trigger && base ? (
        <ColourPopover
          anchor={trigger}
          label="Your colour"
          value={base.color || null}
          theme={[]}
          standard={PRESENCE_GROUP}
          custom={false}
          onClose={() => setOpen(false)}
          onPick={(next) => {
            setOpen(false);
            trigger.focus();
            if (next !== base.color) void choose(base, next);
          }}
        />
      ) : null}
      {failed ? (
        <p role="status" className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          {COLOUR_FAILED}
        </p>
      ) : null}
    </SettingsRowShell>
  );
}
