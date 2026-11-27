// @vitest-environment jsdom
// docs/specs/012-collaboration/review-surfaces.md "Version history": the frame (Back, the shown version's name or
// time), the panel (Current version first, versions grouped by day), the listbox's keys, Escape, and the states.
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OfficeVersion } from '@/lib/office/office-version-list';
import {
  CURRENT_VERSION,
  OfficeVersionHistory,
  VERSIONS_FAILED,
  VERSIONS_LOADING,
} from './OfficeVersionHistory';

afterEach(cleanup);

const now = new Date(2026, 10, 27, 9).getTime();
const VERSIONS: OfficeVersion[] = [
  {
    id: 'v2',
    kind: 'named',
    name: 'Draft',
    takenAt: new Date(2026, 10, 27, 8, 30).getTime(),
    restoredFrom: null,
    editors: [{ key: 'k', name: 'Ada', color: '#0284c7' }],
  },
  {
    id: 'v1',
    kind: 'automatic',
    name: null,
    takenAt: new Date(2026, 10, 26, 14, 5).getTime(),
    restoredFrom: null,
    editors: [],
  },
];

function Harness({
  versions = VERSIONS,
  failed = false,
  onClose = () => {},
  onRetry = () => {},
}: {
  versions?: OfficeVersion[] | null;
  failed?: boolean;
  onClose?: () => void;
  onRetry?: () => void;
}) {
  const [selected, setSelected] = useState(CURRENT_VERSION);
  return (
    <OfficeVersionHistory
      versions={versions}
      failed={failed}
      selected={selected}
      now={now}
      status={null}
      onSelect={setSelected}
      onRetry={onRetry}
      onClose={onClose}
    >
      <p>drawn {selected}</p>
    </OfficeVersionHistory>
  );
}

const selectedName = () =>
  screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true')!
    .textContent;

describe('OfficeVersionHistory', () => {
  it('lists Current version first, then the versions by day, and takes the keyboard', () => {
    render(<Harness />);
    expect(screen.getByRole('dialog', { name: 'Version history' })).toBeTruthy();
    const list = screen.getByRole('listbox', { name: 'Versions' });
    expect(document.activeElement).toBe(list);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Current version',
      'Draft08:30Ada',
      '14:05',
    ]);
    expect(
      within(screen.getByRole('group', { name: 'Today' })).getAllByRole('option'),
    ).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Yesterday' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Current version');
  });

  it('shows each version as the arrow keys reach it, and names it at the top', () => {
    render(<Harness />);
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(selectedName()).toBe('Draft08:30Ada');
    expect(screen.getByText('drawn v2')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Draft');
    fireEvent.keyDown(list, { key: 'End' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Yesterday, 14:05');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(screen.getByText('drawn v1')).toBeTruthy();
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    fireEvent.keyDown(list, { key: 'Home' });
    expect(selectedName()).toBe('Current version');
    expect(list.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]!.id);
    fireEvent.keyDown(list, { key: 'a' });
    fireEvent.click(screen.getAllByRole('option')[2]!);
    expect(screen.getByText('drawn v1')).toBeTruthy();
  });

  it('leaves by Escape or Back', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('says while the versions load, and offers to try again when they cannot be read', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<Harness versions={null} />);
    expect(screen.getByText(VERSIONS_LOADING)).toBeTruthy();
    expect(screen.getByRole('listbox').getAttribute('aria-busy')).toBe('true');
    rerender(<Harness versions={null} failed onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toContain(VERSIONS_FAILED);
    expect(screen.queryByText(VERSIONS_LOADING)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('says a status in the panel', () => {
    render(
      <OfficeVersionHistory
        versions={[]}
        failed={false}
        selected="gone"
        now={now}
        status="That didn’t work. Try again."
        onSelect={() => {}}
        onRetry={() => {}}
        onClose={() => {}}
      >
        {null}
      </OfficeVersionHistory>,
    );
    expect(screen.getByRole('status').textContent).toBe('That didn’t work. Try again.');
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
  });
});
