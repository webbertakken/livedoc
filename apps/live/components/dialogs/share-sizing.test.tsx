// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusInviteDialog } from './FocusInviteDialog';
import { SECTION_LABEL } from './share-dialog-parts';
import { ShareRolePicker } from './ShareRolePicker';
import { TeamFormModal } from './TeamFormModal';

afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

// docs/specs/004-interface-design/sizing.md: a dialog's title is 22 px regular, a section's label reads in its own
// case, rows are 28 px at the reading size over 12 px supporting text, and nothing is set in tracked capitals.
describe('sharing dialogs on the sizing scale', () => {
  it('labels a share section as supporting text in its own case', () => {
    expect(SECTION_LABEL).toContain('text-supporting');
    expect(SECTION_LABEL).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('draws the role picker at the reading size, its options on the row step', () => {
    render(<ShareRolePicker role="edit" onChange={() => {}} />);

    const trigger = screen.getByRole('button', { expanded: false });
    expect(trigger.querySelector('.text-body')?.textContent).toBe('Editor');
    expect(trigger.innerHTML).not.toMatch(TRACKED_OR_HEAVY);

    fireEvent.click(trigger);
    const option = screen.getByRole('radio', { name: /Viewer/ });
    expect(option.className).toContain('min-h-row');
    expect(option.innerHTML).toContain('text-supporting');
    expect(option.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('sets a team form title at the dialog title step, regular', () => {
    render(
      <TeamFormModal
        open
        title="Edit Team"
        submitLabel="Save"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const title = screen.getByText('Edit Team').className;
    expect(title).toContain('text-dialog-title');
    expect(title).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('titles a focus invitation at the panel title step, without tracked capitals', () => {
    render(<FocusInviteDialog from="Sam" onAccept={vi.fn()} onDismiss={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('h2')?.className).toContain('text-panel-title');
    expect(dialog.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });
});
