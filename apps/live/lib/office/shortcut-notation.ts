// The office kinds' shortcut notation (docs/specs/034-text-documents/keyboard-shortcuts.md "Notation"): one text
// per platform and action, read into the ways it can be pressed, and written back for a menu row or a tooltip.
// Keys are matched by `KeyboardEvent.code`, never `key`: Option changes the character a key types on a Mac.

export type OfficePlatform = 'pc' | 'mac' | 'chromeos';

export type ShortcutModifier = 'ctrl' | 'alt' | 'shift' | 'meta';

// One press: the modifiers held and the key's code.
export type KeyStep = { mods: ShortcutModifier[]; code: string };

// One way to give a shortcut: a press, or a sequence of two under the same modifiers; or a pointer gesture.
export type ShortcutWay = {
  steps: KeyStep[];
  // Holds only in Chrome, or only in other browsers.
  browser?: 'chrome' | 'other';
  // The digit a `[1-6]` range stood for.
  arg?: string;
  pointer?: string;
};

export const MODIFIER_ORDER: readonly ShortcutModifier[] = ['ctrl', 'alt', 'shift', 'meta'];

const MODIFIERS: Record<string, ShortcutModifier> = {
  Ctrl: 'ctrl',
  Alt: 'alt',
  Option: 'alt',
  Shift: 'shift',
  '⌘': 'meta',
  Search: 'meta',
};

const NAMED: Record<string, string> = {
  Enter: 'Enter',
  Esc: 'Escape',
  Space: 'Space',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Home: 'Home',
  End: 'End',
  PgUp: 'PageUp',
  PgDn: 'PageDown',
  F7: 'F7',
  F10: 'F10',
  Plus: 'Equal',
  '/': 'Slash',
  '\\': 'Backslash',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '.': 'Period',
  ',': 'Comma',
  "'": 'Quote',
  ';': 'Semicolon',
  '~': 'Backquote',
  '-': 'Minus',
};

// A Mac's Fn turns the arrows into the keys a full keyboard has for them.
const WITH_FN: Record<string, string> = {
  Left: 'Home',
  Right: 'End',
  Up: 'PageUp',
  Down: 'PageDown',
  F7: 'F7',
};

const POINTER = /^(Shift\+)?(Double-click|Triple-click|right-click)(\+drag)?$/;
const RANGE = /\[(\d)-(\d)\]/;

function codeOf(key: string, fn: boolean): string {
  if (fn) {
    const code = WITH_FN[key];
    if (!code) throw new Error(`shortcut: Fn+${key} is not a key`);
    return code;
  }
  if (/^[A-Z]$/.test(key)) return `Key${key}`;
  if (/^\d$/.test(key)) return `Digit${key}`;
  const named = NAMED[key];
  if (!named) throw new Error(`shortcut: ${key} is not a key`);
  return named;
}

// "Ctrl+Shift+\" splits on the plus signs between keys; a key may itself be "+"-free punctuation.
function splitKeys(press: string): string[] {
  const parts = press.split('+');
  if (parts.some((p) => p === '')) throw new Error(`shortcut: "${press}" has an empty key`);
  return parts;
}

function readPress(press: string): KeyStep {
  const parts = splitKeys(press);
  const key = parts.pop()!;
  const held = new Set<ShortcutModifier>();
  let fn = false;
  for (const part of parts) {
    if (part === 'Fn') fn = true;
    else if (MODIFIERS[part]) held.add(MODIFIERS[part]);
    else throw new Error(`shortcut: ${part} is not a modifier`);
  }
  return { mods: MODIFIER_ORDER.filter((m) => held.has(m)), code: codeOf(key, fn) };
}

function readWay(text: string): ShortcutWay[] {
  let body = text.trim();
  let browser: ShortcutWay['browser'];
  if (body.endsWith(' (Chrome)')) {
    browser = 'chrome';
    body = body.slice(0, -' (Chrome)'.length);
  } else if (body.endsWith(' (other browsers)')) {
    browser = 'other';
    body = body.slice(0, -' (other browsers)'.length);
  }
  if (POINTER.test(body)) return [{ steps: [], pointer: body }];
  const range = RANGE.exec(body);
  const digits = range
    ? Array.from({ length: Number(range[2]) - Number(range[1]) + 1 }, (_, i) =>
        String(Number(range[1]) + i),
      )
    : [null];
  return digits.map((digit) => {
    const written = digit === null ? body : body.replace(RANGE, digit);
    const [first, second] = written.split(', ');
    const press = readPress(first!);
    const steps =
      second === undefined
        ? [press]
        : [press, readPress(`${first!.slice(0, first!.lastIndexOf('+') + 1)}${second}`)];
    return {
      steps,
      ...(browser ? { browser } : {}),
      ...(digit !== null ? { arg: digit } : {}),
    };
  });
}

export function parseShortcut(text: string): ShortcutWay[] {
  if (text.trim() === '—') return [];
  return text.split(' or ').flatMap(readWay);
}

const MAC_SYMBOLS: Record<ShortcutModifier, string> = {
  ctrl: '⌃',
  alt: '⌥',
  shift: '⇧',
  meta: '⌘',
};
const PC_NAMES: Record<ShortcutModifier, string> = {
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
};
const ARROWS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};
const CODE_NAMES: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(NAMED)
      .filter(([name]) => name.length === 1)
      .map(([name, code]) => [code, name]),
  ),
  Escape: 'Esc',
  Equal: '+',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return ARROWS[code] ?? CODE_NAMES[code] ?? code;
}

function writePress({ mods, code }: KeyStep, platform: OfficePlatform): string {
  if (platform === 'mac') return mods.map((m) => MAC_SYMBOLS[m]).join('') + keyName(code);
  const names = mods.map((m) => (m === 'meta' && platform === 'chromeos' ? 'Search' : PC_NAMES[m]));
  return [...names, keyName(code)].join('+');
}

export function formatShortcut(way: ShortcutWay, platform: OfficePlatform): string {
  if (way.pointer) return way.pointer;
  const [first, second] = way.steps;
  if (!first) return '';
  const head = writePress(first, platform);
  return second ? `${head} ${keyName(second.code)}` : head;
}

const ARIA_MODIFIERS: Record<ShortcutModifier, string> = {
  ctrl: 'Control',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
};

// A press in `aria-keyshortcuts` form ("Control+Shift+Z"); a sequence has none.
function ariaOf(way: ShortcutWay): string {
  const [press, second] = way.steps;
  if (!press || second) return '';
  const key = press.code.startsWith('Key')
    ? press.code.slice(3)
    : press.code.startsWith('Digit')
      ? press.code.slice(5)
      : (CODE_NAMES[press.code] ?? press.code);
  return [...press.mods.map((m) => ARIA_MODIFIERS[m]), key === 'Esc' ? 'Escape' : key].join('+');
}

export type ShortcutText = { shown: string; aria: string };

// What a menu row or tooltip shows of a registry row: its first way on this platform and browser, and its ARIA name.
export function shortcutTextOf(
  rows: readonly { id: string; keys: Record<OfficePlatform, string> }[],
  { platform, chrome }: { platform: OfficePlatform; chrome: boolean },
): (id: string) => ShortcutText | null {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return (id) => {
    const row = byId.get(id);
    if (!row) return null;
    const way = parseShortcut(row.keys[platform]).find(
      (w) => w.steps.length > 0 && (!w.browser || (w.browser === 'chrome') === chrome),
    );
    return way ? { shown: formatShortcut(way, platform), aria: ariaOf(way) } : null;
  };
}
