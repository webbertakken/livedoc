// A Form tab as the api reads it (docs/specs/030-forms/forms.md §11): its form, the boards its destination
// names, and the backdrop its form page draws on.
import { tabKindOf } from '@livedoc/document';
import {
  destinationProblem,
  readForm,
  type DestinationProblem,
  type FormDefinition,
} from '@livedoc/forms';
import { normaliseBoardSetup, type ItemTypeDef, type PlanBoardSetup } from '@livedoc/items';
import { documentLinksTab, getTab, liveFormLinksOf, readSheetHead, setFormLinkOpen } from '../db';
import { isSpreadsheetSheet, type FormPlanSheet, type FormSheetDestination } from '@livedoc/forms';
import { documentRoom } from '../document-room/document-client';
import type { TabDTO, DocumentEnv } from '../types';

type FormTab = { tab: TabDTO; form: FormDefinition };

// The document's Form tab and its form; null when the tab is gone, is no Form tab, or holds no form.
export async function readFormTab(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
): Promise<FormTab | null> {
  const tab = await getTab(env, documentId, tabId);
  if (!tab || tabKindOf(tab) !== 'form') return null;
  const form = readForm(tab.form);
  return form ? { tab, form } : null;
}

// The boards on a tab of the document (none when it is gone or holds none).
export async function boardsOnTab(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
): Promise<PlanBoardSetup[]> {
  const tab = await getTab(env, documentId, tabId);
  if (!tab || tabKindOf(tab) !== 'board') return [];
  const boards: PlanBoardSetup[] = [];
  for (const el of tab.elements ?? []) {
    const raw = (el as { planBoard?: unknown }).planBoard;
    const setup = raw === undefined ? null : normaliseBoardSetup(raw);
    if (setup) boards.push(setup);
  }
  return boards;
}

// Whether a Sheet destination still holds: its sheet on its tab, and that tab still in the document (a deleted Sheet
// tab can leave its sheet behind until it is swept, and a row written there is never seen).
export async function sheetOnItsTab(
  env: DocumentEnv,
  documentId: string,
  sheet: FormPlanSheet,
): Promise<boolean> {
  const head = await readSheetHead(env, documentId, sheet.sheetId);
  return (
    !!head && head.tabId === sheet.tabId && (await documentLinksTab(env, documentId, sheet.tabId))
  );
}

// Whether a form's sheet holds: a Sheet tab's on its tab in the document; a spreadsheet's asked of its own room, which
// checks the spreadsheet, the form's connection and the sheet (plan-links.md "Form responses"). A room that cannot be
// reached answers that it does not, so no response is taken that could not land.
export async function formSheetThere(
  env: DocumentEnv,
  documentId: string,
  formTabId: string,
  sheet: FormSheetDestination,
): Promise<boolean> {
  if (!isSpreadsheetSheet(sheet)) return sheetOnItsTab(env, documentId, sheet);
  try {
    return await documentRoom(env, sheet.documentId).formSheetThere({
      form: { documentId, tabId: formTabId },
      sheetId: sheet.sheetId,
    });
  } catch (error) {
    console.warn('[forms] form.spreadsheet.unreached', { reason: String(error) });
    return false;
  }
}

// Why responses could not land now, or null when they can (docs/specs/030-forms/forms.md "Responses to a Sheet",
// "Publishing and the form link"): the sheet gone, or the board destination's problem.
export async function responsesProblem(
  env: DocumentEnv,
  documentId: string,
  formTabId: string,
  form: FormDefinition,
  types: readonly ItemTypeDef[],
): Promise<DestinationProblem | 'sheet_missing' | null> {
  if (form.sheet) {
    return (await formSheetThere(env, documentId, formTabId, form.sheet)) ? null : 'sheet_missing';
  }
  const boards = form.destination ? await boardsOnTab(env, documentId, form.destination.tabId) : [];
  return destinationProblem(form.destination, boards, types);
}

// A board or sheet tab deleted (docs/specs/030-forms/forms.md "Publishing and the form link"): each live form whose
// responses went there stops taking responses (its link closed, never deleted), as they would have nowhere to go. It
// opens again only once it has somewhere to send them. Answers how many.
export async function pauseFormsFeeding(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
): Promise<number> {
  let paused = 0;
  for (const link of await liveFormLinksOf(env, documentId)) {
    if (link.tab_id === tabId) continue;
    const found = await readFormTab(env, documentId, link.tab_id);
    // A sheet wins over the board it kept; a spreadsheet's sheet is on no tab here.
    const form = found?.form;
    const to = form?.sheet ? form.sheet.tabId : form?.destination?.tabId;
    if (to !== tabId) continue;
    await setFormLinkOpen(env, link.code, false);
    console.info('[forms] form.paused.destination_deleted', { documentId });
    paused += 1;
  }
  return paused;
}
