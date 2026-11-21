// @vitest-environment jsdom
// docs/specs/004-interface-design/office-shell.md "Dialogs": tabs chosen by a press or the arrow keys; a tab not yet built
// is dimmed, never chosen, and passed over by the arrows.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { OfficeDialogTabs } from './OfficeDialogTabs';

const TABS = [
  ['a', 'First'],
  ['b', 'Second'],
  ['c', 'Third'],
] as const;

describe('OfficeDialogTabs', () => {
  it('passes over a tab not yet built', () => {
    const onChange = vi.fn();
    render(
      <OfficeDialogTabs
        id="t"
        label="Tabs"
        tabs={TABS}
        value="a"
        onChange={onChange}
        disabled={['b']}
      />,
    );
    const second = screen.getByRole('tab', { name: 'Second' });
    expect(second.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(second);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'First' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('c');
    fireEvent.click(screen.getByRole('tab', { name: 'Third' }));
    expect(onChange).toHaveBeenLastCalledWith('c');
  });
});
