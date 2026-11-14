// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { setTurnReadout } from '@/lib/turn-readout';
import { EditorBoxContext, type EditorBox } from '@/hooks/ui/useEditorBox';
import { TurnReadout, TURN_READOUT_OFFSET_PX } from './TurnReadout';

// docs/specs/008-canvas/selection-transforms.md "Rotating by hand": the angle readout, ST6 and ST7.
afterEach(() => act(() => setTurnReadout(null)));

describe('TurnReadout', () => {
  it('draws nothing in the static export, whatever a turn published', () => {
    setTurnReadout({ angle: 30, clientX: 1, clientY: 1 });
    expect(renderToString(<TurnReadout />)).toBe('');
  });

  it('draws nothing while no turn is under way', () => {
    const { container } = render(<TurnReadout />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the angle in degrees beside the pointer', () => {
    render(<TurnReadout />);
    act(() => setTurnReadout({ angle: 135, clientX: 200, clientY: 150 }));
    const pill = screen.getByText('135°');
    expect(TURN_READOUT_OFFSET_PX).toBe(16);
    expect(pill.style.left).toBe('216px');
    expect(pill.style.top).toBe('166px');
    expect(pill.getAttribute('data-turn-readout')).toBe('');
  });

  it('follows the pointer and goes when the turn ends', () => {
    render(<TurnReadout />);
    act(() => setTurnReadout({ angle: 10, clientX: 100, clientY: 100 }));
    act(() => setTurnReadout({ angle: 12, clientX: 120, clientY: 90 }));
    expect(screen.getByText('12°').style.left).toBe('136px');
    act(() => setTurnReadout(null));
    expect(screen.queryByText(/°/)).toBeNull();
  });

  it('stays on screen near the right and bottom edges', () => {
    render(<TurnReadout />);
    act(() =>
      setTurnReadout({ angle: 5, clientX: window.innerWidth - 2, clientY: window.innerHeight - 2 }),
    );
    const pill = screen.getByText('5°');
    expect(pill.style.left).toBe(`${window.innerWidth - 2 - TURN_READOUT_OFFSET_PX}px`);
    expect(pill.style.top).toBe(`${window.innerHeight - 2 - TURN_READOUT_OFFSET_PX}px`);
    expect(pill.style.transform).toBe('translate(-100%, -100%)');
  });
});

// docs/specs/007-editor/split-view.md "How the editor fits in its pane": in a split the pill counts from the editor
// pane's corner, and stays readable at the pane's own right edge.
describe('TurnReadout in a split', () => {
  const inPane = (box: EditorBox) =>
    render(
      <EditorBoxContext.Provider value={box}>
        <TurnReadout />
      </EditorBoxContext.Provider>,
    );

  it("sits beside the pointer in the right pane, counted from the pane's corner", () => {
    inPane({ left: 600, top: 0, width: 400 });
    act(() => setTurnReadout({ angle: 45, clientX: 700, clientY: 150 }));

    const pill = screen.getByText('45°');
    expect(pill.style.left).toBe(`${100 + TURN_READOUT_OFFSET_PX}px`);
    expect(pill.style.top).toBe(`${150 + TURN_READOUT_OFFSET_PX}px`);
  });

  it("flips at the left pane's right edge, the divider", () => {
    inPane({ left: 0, top: 0, width: 500 });
    act(() => setTurnReadout({ angle: 90, clientX: 490, clientY: 150 }));

    const pill = screen.getByText('90°');
    expect(pill.style.left).toBe(`${490 - TURN_READOUT_OFFSET_PX}px`);
    expect(pill.style.transform).toMatch(/^translate\(-100%/);
  });
});
