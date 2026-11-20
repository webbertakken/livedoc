// What the toolbar's controls show now (docs/specs/004-interface-design/office-shell.md "Toolbar"): each toggle's
// pressed state, each control's dimmed state and the font size, read from the bindings as plain values whenever the
// kind says they may have changed. Read through an external store, not as a binding's getters in render: the editor's
// compiler keeps what a render derives from unchanged props, so a getter read there would never be read again.
import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import type { OfficeControl } from '@/lib/office/office-toolbar';
import type { OfficeFontSize } from './OfficeFontSizeField';
import type { OfficeFontFamily } from './OfficeFontMenu';

export type OfficeControlStates = {
  readonly pressed: ReadonlySet<string>;
  readonly disabled: ReadonlySet<string>;
  readonly fontSize: number | null;
  readonly fontFamily: string | null;
};

const NEVER = () => () => {};

function readStates(
  controls: readonly OfficeControl[],
  actions: OfficeActions,
  fontSize: OfficeFontSize | null,
  fontFamily: OfficeFontFamily | null,
): OfficeControlStates {
  const pressed = new Set<string>();
  const disabled = new Set<string>();
  for (const { id } of controls) {
    const action = actions[id];
    if (action?.checked === true) pressed.add(id);
    if (action?.disabled === true) disabled.add(id);
  }
  return {
    pressed,
    disabled,
    fontSize: fontSize?.read() ?? null,
    fontFamily: fontFamily?.read() ?? null,
  };
}

const keyOf = ({ pressed, disabled, fontSize, fontFamily }: OfficeControlStates) =>
  JSON.stringify([[...pressed], [...disabled], fontSize, fontFamily]);

export function useOfficeControlStates(
  controls: readonly OfficeControl[],
  actions: OfficeActions,
  fontSize: OfficeFontSize | null,
  fontFamily: OfficeFontFamily | null,
  refresh: ((listener: () => void) => () => void) | undefined,
): OfficeControlStates {
  // The last states read, handed back while nothing they show has changed, as the store's snapshot must be.
  const last = useRef<{ key: string; states: OfficeControlStates } | null>(null);
  const snapshot = useCallback(() => {
    const states = readStates(controls, actions, fontSize, fontFamily);
    const key = keyOf(states);
    if (last.current?.key !== key) last.current = { key, states };
    return last.current.states;
  }, [controls, actions, fontSize, fontFamily]);
  return useSyncExternalStore(refresh ?? NEVER, snapshot, snapshot);
}
