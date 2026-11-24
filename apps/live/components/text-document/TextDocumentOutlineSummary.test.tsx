// @vitest-environment jsdom
// docs/specs/034-text-documents/links-and-navigation.md "The summary": titled Summary, + Add summary with none and Edit
// summary with text for an Editor; a field in place, kept on leaving or Ctrl+Enter, Escape keeping the old text;
// nothing at all for anyone else while there is none.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  ADD_SUMMARY_LABEL,
  EDIT_SUMMARY_LABEL,
  SUMMARY_TITLE,
  TextDocumentOutlineSummary,
} from './TextDocumentOutlineSummary';
import type { TextDocumentSummary } from './useTextDocumentSummary';

const summaryOf = (over: Partial<TextDocumentSummary> = {}): TextDocumentSummary => ({
  text: '',
  canEdit: true,
  editing: false,
  edit: vi.fn(),
  finish: vi.fn(),
  ...over,
});

afterEach(cleanup);

describe('TextDocumentOutlineSummary', () => {
  it('offers an Editor + Add summary while there is none', () => {
    const summary = summaryOf();
    render(<TextDocumentOutlineSummary summary={summary} />);
    expect(screen.getByRole('heading', { name: SUMMARY_TITLE })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: ADD_SUMMARY_LABEL }));
    expect(summary.edit).toHaveBeenCalled();
  });

  it('shows the text, line breaks kept, with Edit summary for an Editor', () => {
    const summary = summaryOf({ text: 'One\nTwo' });
    render(<TextDocumentOutlineSummary summary={summary} />);
    expect(screen.getByText(/One\s+Two/).className).toContain('whitespace-pre-wrap');
    fireEvent.click(screen.getByRole('button', { name: EDIT_SUMMARY_LABEL }));
    expect(summary.edit).toHaveBeenCalled();
  });

  it('shows anyone else the text alone, and nothing while there is none', () => {
    const { rerender, container } = render(
      <TextDocumentOutlineSummary summary={summaryOf({ canEdit: false, text: 'Read me' })} />,
    );
    expect(screen.getByText('Read me')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<TextDocumentOutlineSummary summary={summaryOf({ canEdit: false })} />);
    expect(container.innerHTML).toBe('');
  });

  it('opens a field in place with the text, focused, the caret at its end', () => {
    render(<TextDocumentOutlineSummary summary={summaryOf({ text: 'Draft', editing: true })} />);
    const field = screen.getByRole<HTMLTextAreaElement>('textbox', { name: SUMMARY_TITLE });
    expect(field.value).toBe('Draft');
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(5);
  });

  function open() {
    const summary = summaryOf({ text: 'Draft', editing: true });
    render(<TextDocumentOutlineSummary summary={summary} />);
    const field = screen.getByRole('textbox', { name: SUMMARY_TITLE });
    fireEvent.change(field, { target: { value: 'Final' } });
    return { summary, field };
  }

  it('keeps the text on Ctrl+Enter, once; Enter is a new line', () => {
    const { summary, field } = open();
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(summary.finish).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });
    fireEvent.blur(field);
    expect(summary.finish).toHaveBeenCalledTimes(1);
    expect(summary.finish).toHaveBeenCalledWith('Final');
  });

  it('keeps the old text on Escape, the blur after it keeping nothing', () => {
    const { summary, field } = open();
    fireEvent.keyDown(field, { key: 'Escape' });
    fireEvent.blur(field);
    expect(summary.finish).toHaveBeenCalledTimes(1);
    expect(summary.finish).toHaveBeenCalledWith(null);
  });

  it('keeps the text on leaving the field', () => {
    const { summary, field } = open();
    fireEvent.blur(field);
    expect(summary.finish).toHaveBeenCalledWith('Final');
  });
});
