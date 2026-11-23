// docs/specs/029-sheets/keyboard-shortcuts.md: every way of every row the surface hears itself, on each platform,
// reaches what the row names: the grid's keys (sheetKey), an edit's (formulaKey), the area cycle (regionStep) and the
// editor's history keys.
import { describe, expect, it } from 'vitest';
import { runModShortcut } from '@/hooks/canvas/editor-shortcut-keys';
import { regionStep } from '@/hooks/ui/useRegionCycle';
import { parseShortcut, type KeyStep, type OfficePlatform } from '@/lib/office/shortcut-notation';
import { SPREADSHEET_SHORTCUTS } from '@/lib/spreadsheet/spreadsheet-shortcuts';
import { formulaKey } from '@/components/sheets/formula-keys';
import { sheetKey } from '@/components/sheets/sheet-keys';

type Press = {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
};

const CHARACTERS: Record<string, string> = {
  Space: ' ',
  Semicolon: ';',
  Backslash: '\\',
  Period: '.',
  Comma: ',',
  Slash: '/',
};

// What ChromeOS sends for Search with an arrow or a digit (keyboard-shortcuts.md "Notation").
const SEARCH_ARROWS: Record<string, string> = {
  ArrowLeft: 'Home',
  ArrowRight: 'End',
  ArrowUp: 'PageUp',
  ArrowDown: 'PageDown',
};

function pressOf(step: KeyStep, platform: OfficePlatform): Press {
  let { code } = step;
  let meta = step.mods.includes('meta');
  if (platform === 'chromeos' && meta) {
    meta = false;
    code = SEARCH_ARROWS[code] ?? (code.startsWith('Digit') ? `F${code.slice(5)}` : code);
  }
  const shiftKey = step.mods.includes('shift');
  const letter = code.startsWith('Key') ? code.slice(3) : null;
  const key = letter
    ? shiftKey
      ? letter
      : letter.toLowerCase()
    : code.startsWith('Digit')
      ? code.slice(5)
      : (CHARACTERS[code] ?? code);
  return {
    key,
    code,
    ctrlKey: step.mods.includes('ctrl'),
    altKey: step.mods.includes('alt'),
    shiftKey,
    metaKey: meta,
  };
}

// What the editor's history keys run for a press, as useEditorKeyboardShortcuts hands them on.
function historyOf(press: Press): string | null {
  if (!press.ctrlKey && !press.metaKey) return null;
  let ran: string | null = null;
  const live = { isReadOnly: false, undo: () => (ran = 'undo'), redo: () => (ran = 'redo') };
  runModShortcut(
    { ...press, preventDefault: () => {} } as unknown as KeyboardEvent,
    live as unknown as Parameters<typeof runModShortcut>[1],
  );
  return ran;
}

const keyEvent = (press: Press) =>
  ({ ...press, getModifierState: () => false }) as unknown as KeyboardEvent;

// What each row the surface hears comes to.
const HEARD: Record<string, (press: Press, platform: OfficePlatform) => unknown> = {
  undo: historyOf,
  // Ctrl+Y and Ctrl+Shift+Z the editor's; F4 the grid's.
  redo: (press, platform) => historyOf(press) ?? sheetKey(press, platform),
  'insert-array-formula': formulaKey,
  'absolute-relative-references': formulaKey,
  'cycle-focus': (press, platform) => regionStep(keyEvent(press), platform),
};

const EXPECTED: Record<string, unknown[]> = {
  'select-column': [{ kind: 'selectCol' }],
  'select-row': [{ kind: 'selectRow' }],
  'select-all': [{ kind: 'selectAll' }],
  undo: ['undo'],
  redo: ['redo', { kind: 'redo' }],
  'insert-array-formula': ['arrayEntry'],
  'absolute-relative-references': ['anchors'],
  find: [{ kind: 'find', replace: false }],
  'find-and-replace': [{ kind: 'find', replace: true }],
  'fill-range': [{ kind: 'fillRange' }],
  'fill-down': [{ kind: 'fill', dir: 'down' }],
  'fill-right': [{ kind: 'fill', dir: 'right' }],
  'paste-values-only': [{ kind: 'pasteValues' }],
  'insert-time': [{ kind: 'now', what: 'time' }],
  'insert-date': [{ kind: 'now', what: 'date' }],
  'move-to-beginning-of-row': [{ kind: 'home', toSheet: false, extend: false }],
  'move-to-beginning-of-sheet': [{ kind: 'home', toSheet: true, extend: false }],
  'move-to-end-of-row': [{ kind: 'end', toSheet: false, extend: false }],
  'move-to-end-of-sheet': [{ kind: 'end', toSheet: true, extend: false }],
  'move-to-first-cell-with-data': [{ kind: 'move', dir: 'left', jump: true, extend: false }],
  'move-to-last-cell-with-data': [{ kind: 'move', dir: 'right', jump: true, extend: false }],
  'scroll-to-active-cell': [{ kind: 'reveal' }],
  // Alt+Down opens a cell's dropdown first (D136).
  'move-to-next-sheet': [{ kind: 'sheet', step: 1 }, { kind: 'dropdown' }],
  'move-to-previous-sheet': [{ kind: 'sheet', step: -1 }],
  'cycle-focus': ['on', 'back'],
  'move-focus-out': [{ kind: 'leave' }],
  'move-to-quicksum': [{ kind: 'summary' }],
  'find-with-find-tab': [{ kind: 'find', replace: false }],
  'context-menu': [{ kind: 'menu' }],
  'read-column': [{ kind: 'read', axis: 'c' }],
  'read-row': [{ kind: 'read', axis: 'r' }],
};

const PLATFORMS: OfficePlatform[] = ['pc', 'mac', 'chromeos'];
const SURFACE_ROWS = SPREADSHEET_SHORTCUTS.filter((row) => row.status === 'surface');

describe("the spreadsheet surface's own shortcuts", () => {
  it('names what every row the surface hears comes to', () => {
    expect(SURFACE_ROWS.map((row) => row.id).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(SURFACE_ROWS.flatMap((row) => PLATFORMS.map((platform) => [row.id, platform] as const)))(
    '%s is heard on %s by every way listed',
    (id, platform) => {
      const row = SURFACE_ROWS.find((r) => r.id === id)!;
      const hear = HEARD[id] ?? ((press: Press, p: OfficePlatform) => sheetKey(press, p));
      for (const way of parseShortcut(row.keys[platform])) {
        const press = pressOf(way.steps[0]!, platform);
        expect(EXPECTED[id], `${row.keys[platform]} on ${platform}`).toContainEqual(
          hear(press, platform),
        );
      }
    },
  );

  it('reads Search on ChromeOS as the key it stands for', () => {
    const [way] = parseShortcut('Shift+Search+2');
    expect(pressOf(way!.steps[0]!, 'chromeos')).toMatchObject({ code: 'F2', metaKey: false });
    expect(pressOf(way!.steps[0]!, 'pc')).toMatchObject({ code: 'Digit2', metaKey: true });
  });

  it('hears no history key without Ctrl or ⌘', () => {
    expect(historyOf(pressOf({ mods: [], code: 'KeyZ' }, 'pc'))).toBeNull();
  });
});
