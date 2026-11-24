// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';
import { DialogTabs } from './DialogTabs';
import { FormatCard } from './FormatCard';
import { MindOutlineToolButton } from './MindOutlineToolButton';

afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

// docs/specs/004-interface-design/sizing.md: a dialog's title is 22 px regular, everything read or pressed is 14 px,
// medium marks only the chosen tab, a toolbar control is 28 px, and nothing is set semibold or in tracked capitals.
describe('the remaining dialogs on the sizing scale', () => {
  it('titles a confirm dialog at the dialog title step over a 14 px message', () => {
    render(
      <ConfirmDialog
        open
        title="Delete tab?"
        message="It goes for good."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByText('Delete tab?').className).toContain('text-dialog-title');
    expect(screen.getByText('It goes for good.').className).toContain('text-body');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('draws dialog tabs at 14 px with medium only on the chosen one', () => {
    render(
      <DialogTabs
        tabs={['table', 'chart'] as const}
        labels={{ table: 'Table', chart: 'Chart' }}
        value="table"
        onChange={() => {}}
        idPrefix="t"
        ariaLabel="View"
      >
        <p>Body</p>
      </DialogTabs>,
    );

    const chosen = screen.getByRole('tab', { name: 'Table' }).className;
    expect(chosen).toContain('text-body');
    expect(chosen).toContain('font-medium');
    expect(screen.getByRole('tab', { name: 'Chart' }).className).not.toContain('font-medium');
  });

  it('names a format card at 14 px over a 12 px description', () => {
    render(
      <FormatCard title="PNG" description="A picture of the tab" onClick={() => {}}>
        <span />
      </FormatCard>,
    );

    expect(screen.getByText('PNG').className).toContain('text-body');
    expect(screen.getByText('A picture of the tab').className).toContain('text-supporting');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('draws a mind outline tool as a 28 px toolbar control', () => {
    render(
      <MindOutlineToolButton label="Bold" shortcut="Ctrl+B" onClick={() => {}}>
        <span>B</span>
      </MindOutlineToolButton>,
    );

    expect(screen.getByRole('button', { name: /Bold/ }).className).toContain('size-row');
  });
});
