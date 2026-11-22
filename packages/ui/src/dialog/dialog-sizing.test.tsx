// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DialogCloseButton } from './DialogCloseButton';
import { DialogHeader } from './DialogHeader';

afterEach(cleanup);

// docs/specs/004-interface-design/sizing.md: a dialog's title is 22 px regular, its subtitle reads at 14, and its
// close button is a 28 px icon button (24 in the compact header).
describe('dialog parts on the sizing scale', () => {
  it('sets the title at the dialog title step in regular weight', () => {
    render(<DialogHeader title="Share" subtitle="Who can open this document" />);

    const title = screen.getByRole('heading', { name: 'Share' }).className;
    expect(title).toContain('text-dialog-title');
    expect(title).not.toContain('font-semibold');
    expect(screen.getByText('Who can open this document').className).toContain('text-body');
  });

  it('draws the close button at the row step, and at the chip step when compact', () => {
    render(
      <>
        <DialogCloseButton onClick={() => {}} />
        <DialogCloseButton onClick={() => {}} compact />
      </>,
    );

    const [regular, compact] = screen.getAllByRole('button', { name: 'Close' });
    expect(regular?.className).toContain('size-row');
    expect(compact?.className).toContain('size-chip');
  });
});
