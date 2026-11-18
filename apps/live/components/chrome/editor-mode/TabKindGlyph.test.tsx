// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TabKindGlyph } from './TabKindGlyph';

afterEach(() => cleanup());

const hover = (el: Element) => {
  fireEvent.pointerEnter(el, { pointerType: 'mouse' });
  fireEvent.pointerMove(el, { pointerType: 'mouse' });
};

// docs/specs/007-editor/editor-modes.md "A tab's kind is always findable".
describe('TabKindGlyph', () => {
  it('names the kind to a screen reader when it stands alone', () => {
    render(<TabKindGlyph tab={{ id: 't', kind: 'board', opensIn: 'plan' }} />);
    expect(screen.getByRole('img', { name: 'Board tab' })).toBeTruthy();
  });

  it('shows the kind in its hover card, a general tab with its mode', () => {
    render(<TabKindGlyph tab={{ id: 't', kind: 'diagram', opensIn: 'draw' }} />);
    hover(screen.getByRole('img'));
    expect(screen.getByRole('tooltip').textContent).toBe('Diagram tab, in Sketch mode');
  });

  it('stays out of the name of the control it sits in', () => {
    render(
      <button type="button">
        <TabKindGlyph tab={{ id: 't', kind: 'sheet' }} named={false} />
        Budget
      </button>,
    );
    expect(screen.getByRole('button', { name: 'Budget' })).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
