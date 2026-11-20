// The shortcut layer's matcher (docs/specs/004-interface-design/office-shell.md "Shortcut layer"): key presses in,
// the registry row they give out. A sequence waits on its first key with its modifiers held and runs on its second;
// any other key, or letting the modifiers go, ends it. Where a press is a shortcut of its own and also the start of
// a sequence, letting the modifiers go runs the press.
import {
  MODIFIER_ORDER,
  parseShortcut,
  type KeyStep,
  type OfficePlatform,
  type ShortcutWay,
} from './shortcut-notation';

export type ShortcutKey = {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
};

export type ShortcutMatch = { id: string; arg?: string };

export type ShortcutKeys = Record<OfficePlatform, string>;

export type ShortcutMatcher = {
  keydown: (key: ShortcutKey) => ShortcutMatch | 'pending' | null;
  keyup: (key: ShortcutKey) => ShortcutMatch | null;
  reset: () => void;
};

const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/;

const FLAG = {
  ctrl: 'ctrlKey',
  alt: 'altKey',
  shift: 'shiftKey',
  meta: 'metaKey',
} as const;

function pressMatches(step: KeyStep, key: ShortcutKey): boolean {
  if (step.code !== key.code) return false;
  return MODIFIER_ORDER.every((m) => step.mods.includes(m) === key[FLAG[m]]);
}

const matchOf = (id: string, way: ShortcutWay): ShortcutMatch =>
  way.arg === undefined ? { id } : { id, arg: way.arg };

export function createShortcutMatcher(
  rows: readonly { id: string; keys: ShortcutKeys }[],
  { platform, chrome }: { platform: OfficePlatform; chrome: boolean },
): ShortcutMatcher {
  const ways = rows.flatMap(({ id, keys }) =>
    parseShortcut(keys[platform])
      .filter((way) => way.steps.length > 0)
      .filter((way) => !way.browser || (way.browser === 'chrome') === chrome)
      .map((way) => ({ id, way })),
  );
  let pending: { sequences: typeof ways; press: ShortcutMatch | null } | null = null;

  const reset = () => {
    pending = null;
  };

  const fresh = (key: ShortcutKey): ShortcutMatch | 'pending' | null => {
    const press = ways.find(
      ({ way }) => way.steps.length === 1 && pressMatches(way.steps[0]!, key),
    );
    const sequences = ways.filter(
      ({ way }) => way.steps.length === 2 && pressMatches(way.steps[0]!, key),
    );
    if (sequences.length > 0) {
      pending = { sequences, press: press ? matchOf(press.id, press.way) : null };
      return 'pending';
    }
    return press ? matchOf(press.id, press.way) : null;
  };

  return {
    keydown(key) {
      if (MODIFIER_CODES.test(key.code)) return null;
      if (pending) {
        const second = pending.sequences.find(({ way }) => pressMatches(way.steps[1]!, key));
        reset();
        if (second) return matchOf(second.id, second.way);
      }
      return fresh(key);
    },
    keyup(key) {
      if (!pending || !MODIFIER_CODES.test(key.code)) return null;
      const press = pending.press;
      reset();
      return press;
    },
    reset,
  };
}
