// The grid's keys when no cell is being edited (docs/specs/029-sheets/sheet.md "Keyboard"), as a pure map from a key
// to a command, so every row of the spec's table is tested without a DOM. Undo and Ctrl+Y are the editor's. Each
// key holds as docs/specs/029-sheets/keyboard-shortcuts.md lists it for the platform.
import type { Dir } from '@livedoc/sheets';
import { altGraphHeld, composedWithAlt } from '@/lib/composed-key';
import type { OfficePlatform } from '@/lib/office/shortcut-notation';

export type KeyLike = {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  // A KeyboardEvent's own: AltGraph says the key was composed with AltGr.
  getModifierState?: (key: 'AltGraph') => boolean;
};

type SheetKeyCommand =
  | { kind: 'move'; dir: Dir; jump: boolean; extend: boolean }
  | { kind: 'tab'; back: boolean }
  | { kind: 'enter'; back: boolean }
  | { kind: 'edit' }
  | { kind: 'type'; text: string }
  | { kind: 'home'; toSheet: boolean; extend: boolean }
  | { kind: 'end'; toSheet: boolean; extend: boolean }
  // Alt: a screen left or right (grid-and-editing.md "Moving around").
  | { kind: 'page'; up: boolean; sideways: boolean; extend: boolean }
  // Ctrl+Backspace: the active cell scrolled back into view.
  | { kind: 'reveal' }
  // Alt+Up, Ctrl+Shift+Page Up / Page Down, a Mac's Option+Left / Right: the previous or next sheet of a spreadsheet.
  | { kind: 'sheet'; step: -1 | 1 }
  // Alt+Shift+Q: focus to the selection's summary.
  | { kind: 'summary' }
  // Ctrl+Alt+Shift+M: focus out of the grid (D137).
  | { kind: 'leave' }
  // F4: redo, as Google's; in an edit it cycles a reference's anchors (useFormulaInput).
  | { kind: 'redo' }
  | { kind: 'selectAll' }
  | { kind: 'selectRow' }
  | { kind: 'selectCol' }
  | { kind: 'clear' }
  // Ctrl+Shift+V: the clipboard's values only.
  | { kind: 'pasteValues' }
  | { kind: 'toggle'; flag: 'b' | 'i' | 'u' | 'st' }
  | { kind: 'now'; what: 'date' | 'time' }
  | { kind: 'find'; replace: boolean }
  | { kind: 'fill'; dir: 'down' | 'right' }
  // Ctrl+Enter outside an edit: accepts a Smart Fill offer (D151).
  | { kind: 'fillRange' }
  | { kind: 'numberFormat'; nf: 'number' | 'currency' | 'percent' }
  | { kind: 'escape' }
  // Alt+Down: the active cell's dropdown (data-validation.md "Using a dropdown"), else the next sheet (D136).
  | { kind: 'dropdown' }
  // Read Row and Read Column (grid-and-editing.md "Accessibility"): Ctrl+Alt+Shift+R or C, Option+Shift on a Mac.
  | { kind: 'read'; axis: 'r' | 'c' }
  // Ctrl+Alt+= and Ctrl+Alt+-: insert or delete lines, or a menu of the four over cells (D157).
  | { kind: 'lines'; op: 'insert' | 'delete' }
  // Ctrl+Alt+9 and 0 hide the selection's rows or columns; Ctrl+Shift+9 and 0 show them.
  | { kind: 'hide'; axis: 'r' | 'c'; hidden: boolean }
  // Alt+Shift+→ and ← group and ungroup; Alt+Shift+↑ and ↓ collapse and expand (grid-and-editing.md "Groups and the
  // outline"; Option on a Mac).
  | { kind: 'group'; op: 'group' | 'ungroup' }
  | { kind: 'fold'; collapse: boolean }
  | { kind: 'menu' };

// The keys of rows and columns, by where they sit (`code`): Option and Shift change what a Mac's keys type.
const LINE_KEYS: Record<string, 'insert' | 'delete'> = { Equal: 'insert', Minus: 'delete' };
const HIDE_KEYS: Record<string, 'r' | 'c'> = { Digit9: 'r', Digit0: 'c' };

const ARROWS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export function sheetKey(e: KeyLike, platform: OfficePlatform = 'pc'): SheetKeyCommand | null {
  // AltGr's Ctrl is not one the person pressed: AltGr+E types €, never a Ctrl shortcut.
  const mod = (e.ctrlKey && !altGraphHeld(e)) || e.metaKey;
  const dir = ARROWS[e.key];
  if (dir && !e.altKey) return { kind: 'move', dir, jump: mod, extend: e.shiftKey };
  if (e.key === 'ArrowDown' && e.altKey && !mod && !e.shiftKey) return { kind: 'dropdown' };
  if (e.key === 'ArrowUp' && e.altKey && !mod && !e.shiftKey) return { kind: 'sheet', step: -1 };
  // A Mac's Option+Left and Option+Right; on a PC Alt+Left and Alt+Right are the browser's Back and Forward.
  const sideways = dir === 'left' || dir === 'right';
  if (platform === 'mac' && sideways && e.altKey && !mod && !e.shiftKey)
    return { kind: 'sheet', step: dir === 'right' ? 1 : -1 };
  if (dir && e.altKey && e.shiftKey && !mod && !altGraphHeld(e))
    return sideways
      ? { kind: 'group', op: dir === 'right' ? 'group' : 'ungroup' }
      : { kind: 'fold', collapse: dir === 'up' };
  if (e.key === 'Tab') return { kind: 'tab', back: e.shiftKey };
  if (e.key === 'Enter' && !mod && !e.altKey) return { kind: 'enter', back: e.shiftKey };
  if (e.key === 'Enter' && mod && !e.altKey && !e.shiftKey) return { kind: 'fillRange' };
  if (e.key === 'F2') return { kind: 'edit' };
  if (e.key === 'F4') return mod || e.altKey || e.shiftKey ? null : { kind: 'redo' };
  if (e.key === 'Home') return { kind: 'home', toSheet: mod, extend: e.shiftKey };
  if (e.key === 'End') return { kind: 'end', toSheet: mod, extend: e.shiftKey };
  if (e.key === 'PageUp' || e.key === 'PageDown') {
    const up = e.key === 'PageUp';
    // Ctrl+Page Up / Page Down switch the browser's tabs: left to it.
    if (mod) return e.shiftKey ? { kind: 'sheet', step: up ? -1 : 1 } : null;
    return { kind: 'page', up, sideways: e.altKey, extend: e.shiftKey };
  }
  if (e.key === 'Backspace' && mod && !e.altKey && !e.shiftKey) return { kind: 'reveal' };
  if (e.key === 'Delete' || e.key === 'Backspace') return mod ? null : { kind: 'clear' };
  if (e.key === 'Escape') return { kind: 'escape' };
  if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) return { kind: 'menu' };
  // Ctrl+Alt+Shift+M, or Ctrl+⌘+Shift+M on a Mac.
  if (e.ctrlKey && e.shiftKey && e.altKey !== e.metaKey && e.code === 'KeyM')
    return { kind: 'leave' };
  const code = e.code ?? '';
  // Ctrl+Alt (⌘+Option on a Mac): a key composed with AltGr is the character it types, never these.
  if (mod && e.altKey && !e.shiftKey && !altGraphHeld(e)) {
    if (LINE_KEYS[code]) return { kind: 'lines', op: LINE_KEYS[code] };
    if (HIDE_KEYS[code]) return { kind: 'hide', axis: HIDE_KEYS[code], hidden: true };
  }
  if (mod && e.shiftKey && !e.altKey && HIDE_KEYS[code])
    return { kind: 'hide', axis: HIDE_KEYS[code], hidden: false };
  if (e.altKey && e.shiftKey && !altGraphHeld(e) && (e.code === 'KeyR' || e.code === 'KeyC'))
    return { kind: 'read', axis: e.code === 'KeyR' ? 'r' : 'c' };
  if (e.altKey && e.shiftKey && !mod && !altGraphHeld(e) && e.code === 'KeyQ')
    return { kind: 'summary' };
  if (e.key === ' ' && e.shiftKey && !mod) return { kind: 'selectRow' };
  if (e.key === ' ' && mod && e.shiftKey) return { kind: 'selectAll' };
  if (e.key === ' ' && e.ctrlKey && !e.shiftKey) return { kind: 'selectCol' };
  if (mod && !e.altKey) {
    const k = e.key.toLowerCase();
    const digit = e.code?.startsWith('Digit') ? e.code.slice(5) : null;
    if (e.shiftKey && (digit === '1' || e.key === '!'))
      return { kind: 'numberFormat', nf: 'number' };
    if (e.shiftKey && (digit === '4' || e.key === '$'))
      return { kind: 'numberFormat', nf: 'currency' };
    if (e.shiftKey && (digit === '5' || e.key === '%'))
      return { kind: 'numberFormat', nf: 'percent' };
    if (e.shiftKey && e.code === 'Backslash') return { kind: 'menu' };
    if (k === 'v' && e.shiftKey) return { kind: 'pasteValues' };
    if (k === 'a' && !e.shiftKey) return { kind: 'selectAll' };
    if (k === 'b' && !e.shiftKey) return { kind: 'toggle', flag: 'b' };
    if (k === 'i' && !e.shiftKey) return { kind: 'toggle', flag: 'i' };
    if (k === 'u' && !e.shiftKey) return { kind: 'toggle', flag: 'u' };
    if (k === 'x' && e.shiftKey) return { kind: 'toggle', flag: 'st' };
    if (e.key === ';' || e.key === ':' || e.code === 'Semicolon')
      return { kind: 'now', what: e.shiftKey ? 'time' : 'date' };
    if (k === 'f' && !e.shiftKey) return { kind: 'find', replace: false };
    // ⌘H hides the browser on a Mac before the page hears it: there, as in Sheets, ⌘⇧H (either works anywhere).
    if (k === 'h') return { kind: 'find', replace: true };
    if (k === 'd' && !e.shiftKey) return { kind: 'fill', dir: 'down' };
    if (k === 'r' && !e.shiftKey) return { kind: 'fill', dir: 'right' };
    return null;
  }
  // A printable character starts typing over the cell, one composed with Alt included.
  if (e.key.length === 1 && (!e.altKey || composedWithAlt(e))) return { kind: 'type', text: e.key };
  return null;
}

// Copy, cut and paste: the browser's own, its clipboard events reaching the grid (sheet.md "Clipboard"). The grid
// keeps them from the editor's chords (the canvas's copy), never from the browser.
export function isClipboardChord(e: KeyLike): boolean {
  const mod = (e.ctrlKey && !altGraphHeld(e)) || e.metaKey;
  return mod && !e.altKey && !e.shiftKey && ['c', 'x', 'v'].includes(e.key.toLowerCase());
}
