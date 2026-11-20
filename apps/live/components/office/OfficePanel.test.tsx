// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { OfficePanelSpec } from '@/lib/office/office-panels';
import { OfficePanel } from './OfficePanel';

const COMMENTS: OfficePanelSpec = {
  id: 'comments',
  title: 'Comments',
  side: 'right',
  item: 'comment-history',
};
const OUTLINE: OfficePanelSpec = {
  id: 'outline',
  title: 'Outline',
  side: 'left',
  item: 'show-outline',
};

function right(over: { focusNonce?: number } = {}) {
  const onClose = vi.fn();
  const onWidth = vi.fn();
  const onWidthDone = vi.fn();
  render(
    <OfficePanel
      spec={COMMENTS}
      width={360}
      onWidth={onWidth}
      onWidthDone={onWidthDone}
      onClose={onClose}
      focusNonce={over.focusNonce ?? 0}
    >
      <button type="button">Inside</button>
    </OfficePanel>,
  );
  return {
    onClose,
    onWidth,
    onWidthDone,
    panel: screen.getByRole('complementary', { name: 'Comments' }),
  };
}

// docs/specs/004-interface-design/office-shell.md "Side panels".
describe('OfficePanel', () => {
  it('is a landmark named by its title, at its width, marked as its side', () => {
    const { panel } = right();
    expect(panel.style.width).toBe('360px');
    expect(panel.dataset.region).toBe('right');
  });

  it('closes from its × and from Escape inside it', () => {
    const { onClose } = right();
    fireEvent.click(screen.getByRole('button', { name: 'Close Comments' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Inside' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('takes focus on its first control when opened from a menu item or shortcut', () => {
    right({ focusNonce: 1 });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inside' }));
  });

  it('resizes from its edge with the arrow keys, Home and End', () => {
    const { onWidth, onWidthDone } = right();
    const edge = screen.getByRole('separator', { name: 'Resize Comments' });
    expect(edge.getAttribute('aria-valuenow')).toBe('360');
    expect(edge.getAttribute('aria-valuemin')).toBe('280');
    expect(edge.getAttribute('aria-valuemax')).toBe('560');
    fireEvent.keyDown(edge, { key: 'ArrowLeft' });
    fireEvent.keyDown(edge, { key: 'ArrowRight' });
    fireEvent.keyDown(edge, { key: 'Home' });
    fireEvent.keyDown(edge, { key: 'End' });
    expect(onWidth.mock.calls).toEqual([[376], [344], [280], [560]]);
    expect(onWidthDone).toHaveBeenCalledTimes(4);
  });

  it('resizes as its edge is dragged, wider to the left, kept once let go', () => {
    const { onWidth, onWidthDone } = right();
    const edge = screen.getByRole('separator', { name: 'Resize Comments' });
    fireEvent.pointerDown(edge, { clientX: 900, pointerId: 1, button: 0 });
    fireEvent.pointerMove(edge, { clientX: 860, pointerId: 1 });
    expect(onWidth).toHaveBeenLastCalledWith(400);
    fireEvent.pointerMove(edge, { clientX: 2000, pointerId: 1 });
    expect(onWidth).toHaveBeenLastCalledWith(280);
    fireEvent.pointerUp(edge, { clientX: 2000, pointerId: 1 });
    expect(onWidthDone).toHaveBeenCalledTimes(1);
  });

  it('draws the left panel at 260 px with no edge, covering the pages on a phone', () => {
    render(
      <OfficePanel spec={OUTLINE} onClose={() => {}} focusNonce={0}>
        <p>Headings</p>
      </OfficePanel>,
    );
    const panel = screen.getByRole('complementary', { name: 'Outline' });
    expect(panel.style.width).toBe('260px');
    expect(screen.queryByRole('separator')).toBeNull();
    expect(panel.className).toContain('max-[599px]:absolute');
  });
});
