// What the Inbox shows of a published form (docs/specs/030-forms/forms.md "Hearing about responses"): its tab's name,
// its heading and the board or Sheet tab its responses land on, kept on its D1 link because the tab lives in the document's room.
// Written when the form is published and pushed again with every write of its tab (document-room/document-outbox.ts).

export type FormLinkShown = { tabName: string; heading: string | null; boardTabId: string | null };

export function formLinkShown(tabName: string, body: Record<string, unknown>): FormLinkShown {
  const form = (body.form && typeof body.form === 'object' ? body.form : {}) as {
    heading?: unknown;
    sheet?: { tabId?: unknown } | null;
    destination?: { tabId?: unknown } | null;
  };
  const sheetTab = form.sheet?.tabId;
  const destinationTab = form.destination?.tabId;
  return {
    tabName,
    heading: typeof form.heading === 'string' ? form.heading : null,
    // A sheet wins over the board it kept; a spreadsheet's sheet is on no tab of the document, so none is named.
    boardTabId: form.sheet
      ? typeof sheetTab === 'string'
        ? sheetTab
        : null
      : typeof destinationTab === 'string'
        ? destinationTab
        : null,
  };
}
