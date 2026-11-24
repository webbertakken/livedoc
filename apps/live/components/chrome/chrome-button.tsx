// Shared styling for the bottom-bar control cluster (ChromeControls +
// AppearanceToggle).
//
// `labelled` (the editor's tab bar) adds a text label beside each icon
// from `sm` up; below it the buttons stay square icon targets, since a
// phone's bar has no room for words (docs/specs/007-editor/live-app.md).
import { useInToolbarGroup } from './ToolbarGroup';
import { TOOLBAR_BUTTON, TOOLBAR_ICON_BUTTON } from './toolbar-surface';

export const CHROME_BTN =
  'relative touch-target ml-0.5 flex h-row min-w-7 shrink-0 items-center justify-center rounded-control text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 sm:ml-1 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white';
export const CHROME_BTN_LABELLED = 'sm:gap-2 sm:px-2';

export function ChromeLabel({ show, children }: { show: boolean; children: string }) {
  const inGroup = useInToolbarGroup();
  if (!show) return null;
  return (
    <span className={`hidden sm:inline ${inGroup ? 'text-optical-centre' : 'text-body'}`}>
      {children}
    </span>
  );
}

// The same controls inside a toolbar group (ToolbarGroup): its flat buttons, 14px names.
export function useChromeButtonClass(labelled: boolean): string {
  const inGroup = useInToolbarGroup();
  if (inGroup)
    return labelled
      ? `${TOOLBAR_BUTTON} phone:w-row tool-line:phone:w-field phone:px-0`
      : TOOLBAR_ICON_BUTTON;
  return labelled ? `${CHROME_BTN} ${CHROME_BTN_LABELLED}` : CHROME_BTN;
}
