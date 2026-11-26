// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Changing a mark": Properties reads the one mark selected, its subject a field
// changed by Enter or leaving it and put back by Escape, and "Make this look the default"; with none it says so.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Mark, PageName } from '@livedoc/pdf-documents';
import type { PdfMarkProperties } from '@/lib/pdf-document/usePdfMarkProperties';
import { NO_MARK_COPY, PdfMarkPropertiesPanel } from './PdfMarkPropertiesPanel';

const ellipse = Mark.shape('ellipse', {
  id: 'e',
  page: PageName.ofObject(3),
  rect: [0, 0, 9, 9],
  width: 3,
  colour: '#123456',
  opacity: 1,
  author: 'Ada',
  createdAt: 1,
})!;

function panel(over: Partial<PdfMarkProperties> = {}) {
  const props: PdfMarkProperties = {
    open: true,
    close: vi.fn(),
    mark: ellipse,
    setSubject: vi.fn(),
    makeDefault: vi.fn(),
    actions: {},
    focusNonce: 0,
    ...over,
  };
  render(<PdfMarkPropertiesPanel properties={props} />);
  return props;
}

describe('the Properties panel', () => {
  it('reads the mark, its subject its kind’s name until changed', () => {
    panel();
    expect(screen.getByText('Kind').nextSibling?.textContent).toBe('Ellipse');
    expect(screen.getByText('Line width').nextSibling?.textContent).toBe('3 pt');
    expect(screen.getByLabelText('Subject')).toHaveProperty('value', 'Ellipse');
  });

  it('changes the subject by Enter or leaving the field, and puts it back with Escape', () => {
    const props = panel();
    const field = screen.getByLabelText('Subject');
    fireEvent.change(field, { target: { value: 'Round this' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(props.setSubject).toHaveBeenLastCalledWith('Round this');
    fireEvent.change(field, { target: { value: 'Other' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(field).toHaveProperty('value', 'Ellipse');
    expect(props.close).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: 'Left' } });
    fireEvent.blur(field);
    expect(props.setSubject).toHaveBeenLastCalledWith('Left');
    // Escape puts back what was typed; with nothing to put back it closes the panel.
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(props.close).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(props.close).toHaveBeenCalled();
  });

  it('makes the look the default, and offers none where the kind takes none', () => {
    const props = panel();
    fireEvent.click(screen.getByRole('button', { name: 'Make this look the default' }));
    expect(props.makeDefault).toHaveBeenCalled();
  });

  it('says what to do with no mark, or several, selected', () => {
    panel({ mark: null, makeDefault: null });
    expect(screen.getByText(NO_MARK_COPY)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Make this look the default' })).toBeNull();
  });
});
