import { describe, expect, it } from 'vitest';
import { textDocumentSaveStatus } from './text-document-save-status';

// docs/specs/034-text-documents/editing-surface.md "The title row": the save status table.
describe('textDocumentSaveStatus', () => {
  const room = { local: false, connected: true, pending: false, failed: false };

  it('is Saved when the room holds every edit, Saving while one is unconfirmed', () => {
    expect(textDocumentSaveStatus(room)).toBe('saved');
    expect(textDocumentSaveStatus({ ...room, pending: true })).toBe('saving');
  });

  it('is Offline while the room is not open, whatever is pending', () => {
    expect(textDocumentSaveStatus({ ...room, connected: false })).toBe('offline');
    expect(textDocumentSaveStatus({ ...room, connected: false, pending: true })).toBe('offline');
  });

  it('lets Failed win over every other status', () => {
    expect(textDocumentSaveStatus({ ...room, failed: true, pending: true })).toBe('failed');
    expect(textDocumentSaveStatus({ ...room, failed: true, connected: false })).toBe('failed');
    expect(textDocumentSaveStatus({ ...room, local: true, failed: true })).toBe('failed');
  });

  it('is Saved in This Browser for a text document there, Saving while a write is due', () => {
    expect(textDocumentSaveStatus({ ...room, local: true, connected: false })).toBe('this-browser');
    expect(textDocumentSaveStatus({ ...room, local: true, pending: true })).toBe('saving');
  });
});
