import { describe, expect, it } from 'vitest';
import { formLinkShown } from './form-link-shown';

// What the Inbox shows of a published form (docs/specs/030-forms/forms.md "Hearing about responses").
describe('formLinkShown', () => {
  const board = { tabId: 'board', typeId: 't', status: 's' };

  it('names the board, or the Sheet tab that wins over it', () => {
    expect(formLinkShown('F', { form: { heading: 'H', destination: board } })).toEqual({
      tabName: 'F',
      heading: 'H',
      boardTabId: 'board',
    });
    expect(
      formLinkShown('F', { form: { destination: board, sheet: { tabId: 'stab', sheetId: 's' } } })
        .boardTabId,
    ).toBe('stab');
  });

  it("names no tab for a spreadsheet's sheet, never the board it kept", () => {
    const form = { destination: board, sheet: { documentId: 'ss', sheetId: 's' } };
    expect(formLinkShown('F', { form }).boardTabId).toBeNull();
  });
});
