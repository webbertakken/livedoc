// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { OFFICE_SAVE_STATUS, type OfficeSaveStatus } from './office-save-status';
import { OfficeSaveStatusButton } from './OfficeSaveStatus';

// docs/specs/034-text-documents/editing-surface.md "The title row": the save status.
describe('OfficeSaveStatusButton', () => {
  const ALL: OfficeSaveStatus[] = ['saving', 'saved', 'this-browser', 'offline', 'failed'];

  it.each(ALL)('names %s by its words', (status) => {
    render(<OfficeSaveStatusButton status={status} />);
    expect(screen.getByRole('button', { name: OFFICE_SAVE_STATUS[status].words })).toBeTruthy();
  });

  it('shows the words beside the glyph only while saving, offline or failed', () => {
    const shown = (status: OfficeSaveStatus) => {
      const { container, unmount } = render(<OfficeSaveStatusButton status={status} />);
      const words = container.querySelector('[data-save-words]')?.textContent ?? null;
      unmount();
      return words;
    };
    expect(shown('saving')).toBe('Saving…');
    expect(shown('offline')).toBe(OFFICE_SAVE_STATUS.offline.words);
    expect(shown('failed')).toBe(OFFICE_SAVE_STATUS.failed.words);
    expect(shown('saved')).toBeNull();
    expect(shown('this-browser')).toBeNull();
  });

  it('announces offline and failed, and nothing else', () => {
    const live = (status: OfficeSaveStatus) => {
      const { unmount } = render(<OfficeSaveStatusButton status={status} />);
      const text = screen.getByRole('status').textContent;
      unmount();
      return text;
    };
    expect(live('offline')).toBe(OFFICE_SAVE_STATUS.offline.words);
    expect(live('failed')).toBe(OFFICE_SAVE_STATUS.failed.words);
    expect(live('saving')).toBe('');
    expect(live('saved')).toBe('');
  });

  it('opens its details on a press, and closes them with Escape', () => {
    render(<OfficeSaveStatusButton status="offline" />);
    const button = screen.getByRole('button', { name: OFFICE_SAVE_STATUS.offline.words });
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(OFFICE_SAVE_STATUS.offline.meaning)).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText(OFFICE_SAVE_STATUS.offline.meaning)).toBeNull();
  });
});
