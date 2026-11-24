// The look of a row in the chrome's plain menus (docs/specs/007-editor/editor-modes.md "The mode switch", mock-up B):
// the mode menu and the add menu. 36px tall, a 6px radius, 10px across, the mark 16px; the current row on the hover
// tint in the strong text colour, others in the body colour taking a lighter tint under the pointer or the keyboard.
import { MODE_SWITCH_FOCUS } from './editor-mode/editor-mode-copy';

// The panel: the shared menu surface (MENU_PANEL's colours and shadow) with mock-up B's 12px radius and 4px padding.
export const CHROME_MENU_SURFACE =
  'flex animate-fade-in flex-col gap-0.5 rounded-surface border border-slate-200/80 bg-white p-1 shadow-xl shadow-slate-900/10 outline-none motion-reduce:animate-none dark:border-slate-700/80 dark:bg-slate-900 dark:shadow-slate-950/60';

export const CHROME_MENU_ROW = `flex h-row w-full items-center gap-3 rounded-control px-3 text-left text-body transition-colors motion-reduce:transition-none ${MODE_SWITCH_FOCUS}`;

export const CHROME_MENU_ROW_IDLE =
  'text-slate-700 hover:bg-slate-100/70 focus-visible:bg-slate-100/70 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:focus-visible:bg-slate-800/60';

export const CHROME_MENU_ROW_CURRENT =
  'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100';

export const CHROME_MENU_MARK = 'shrink-0 text-slate-500 dark:text-slate-400';

export const CHROME_MENU_MARK_CURRENT = 'shrink-0 text-slate-700 dark:text-slate-200';
