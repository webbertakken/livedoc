// The look of a small choice menu (docs/specs/004-interface-design/menus.md): the floating panel, and its
// check-marked radio rows. One source, so the editor's mode menus and its other choice menus read as one
// family. Placement (absolute, top-full, width) stays with each caller. Sized as the office shell's menus
// (docs/specs/004-interface-design/sizing.md): no side inset, 28 px full-width rows, 14 px regular labels.

export const MENU_PANEL =
  'flex animate-fade-in flex-col rounded-menu border border-slate-200/80 bg-white py-1.5 shadow-xl shadow-slate-900/10 motion-reduce:animate-none dark:border-slate-700/80 dark:bg-slate-900 dark:shadow-slate-950/60';

// A menuitemradio row: tinted while checked, and medium while checked, so the choice stands out.
export function menuRadioRowClass(checked: boolean): string {
  const medium = checked ? ' font-medium' : '';
  return `flex min-h-row items-center gap-2 px-3 text-left text-body pointer-coarse:min-h-11${medium} transition-colors duration-micro focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 ${
    checked
      ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-100'
      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
  }`;
}
