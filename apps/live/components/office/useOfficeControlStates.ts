// What the toolbar's controls show now (docs/specs/004-interface-design/office-shell.md "Toolbar"): each toggle's
// pressed state, each control's dimmed state, the font size, the font and each colour, read from the bindings as plain
// values whenever the kind says they may have changed. Read through an external store, not as a binding's getters in
// render: the editor's compiler keeps what a render derives from unchanged props, so a getter read there would never
// be read again.
import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import type { OfficeControl } from '@/lib/office/office-toolbar';
import type { OfficeFontSize } from './OfficeFontSizeField';
import type { OfficeFontFamily } from './OfficeFontMenu';
import type { OfficeColours } from './OfficeColourControl';

/** The value fields the toolbar reads, each null where the kind binds none. */
export type OfficeValueFields = {
  fontSize: OfficeFontSize | null;
  fontFamily: OfficeFontFamily | null;
  colours: OfficeColours | null;
};

export type OfficeControlStates = {
  readonly pressed: ReadonlySet<string>;
  readonly disabled: ReadonlySet<string>;
  readonly fontSize: number | null;
  readonly fontFamily: string | null;
  // Each colour control's colour: `#rrggbb`, null over several, absent for none.
  readonly colours: Readonly<Record<string, string | null | undefined>>;
};

const NEVER = () => () => {};

function readStates(
  controls: readonly OfficeControl[],
  actions: OfficeActions,
  { fontSize, fontFamily, colours }: OfficeValueFields,
): OfficeControlStates {
  const pressed = new Set<string>();
  const disabled = new Set<string>();
  for (const { id } of controls) {
    const action = actions[id];
    if (action?.checked === true) pressed.add(id);
    if (action?.disabled === true) disabled.add(id);
  }
  const colourValues: Record<string, string | null | undefined> = {};
  for (const [id, colour] of Object.entries(colours ?? {})) {
    const value = colour.read();
    if (value !== undefined) colourValues[id] = value;
  }
  return {
    pressed,
    disabled,
    fontSize: fontSize?.read() ?? null,
    fontFamily: fontFamily?.read() ?? null,
    colours: colourValues,
  };
}

const keyOf = ({ pressed, disabled, fontSize, fontFamily, colours }: OfficeControlStates) =>
  JSON.stringify([[...pressed], [...disabled], fontSize, fontFamily, colours]);

export function useOfficeControlStates(
  controls: readonly OfficeControl[],
  actions: OfficeActions,
  { fontSize, fontFamily, colours }: OfficeValueFields,
  refresh: ((listener: () => void) => () => void) | undefined,
): OfficeControlStates {
  // The last states read, handed back while nothing they show has changed, as the store's snapshot must be.
  const last = useRef<{ key: string; states: OfficeControlStates } | null>(null);
  const snapshot = useCallback(() => {
    const states = readStates(controls, actions, { fontSize, fontFamily, colours });
    const key = keyOf(states);
    if (last.current?.key !== key) last.current = { key, states };
    return last.current.states;
  }, [controls, actions, fontSize, fontFamily, colours]);
  return useSyncExternalStore(refresh ?? NEVER, snapshot, snapshot);
}
