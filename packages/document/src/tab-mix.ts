// Which kinds of tab may share a document (docs/specs/029-sheets/spreadsheet.md "The workbook shape"): a spreadsheet
// holds only sheet tabs. Until Plan's Sheet tabs are migrated, a sheet tab outside a spreadsheet is a Plan Sheet tab,
// so only a spreadsheet refuses; whether a document is one is its workbook row's to say, never its tabs'.
import { tabKindOf } from './tab-kind';

export type TabMixRefusal = 'tab_kind_mixed';

/** `tab_kind_mixed` when the tabs could not all live in the document, else null. */
export function tabMixRefusal(
  spreadsheet: boolean,
  tabs: readonly { kind?: string }[],
): TabMixRefusal | null {
  if (!spreadsheet) return null;
  return tabs.every((tab) => tabKindOf(tab) === 'sheet') ? null : 'tab_kind_mixed';
}
