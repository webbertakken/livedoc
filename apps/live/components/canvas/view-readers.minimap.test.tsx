// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// docs/specs/026-plan/plan-board.md "Maximised board": the Map hides while a Plan board covers the canvas.
let covered = false;
vi.mock('@/hooks/plan/plan-cover-store', () => ({ useCanvasCovered: () => covered }));
vi.mock('@/hooks/canvas/useViewportStore', () => ({
  useViewportOf: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
}));
vi.mock('@/components/canvas/Minimap', () => ({ Minimap: () => <div>Map</div> }));
const { ViewMinimap } = await import('./view-readers');

afterEach(cleanup);

describe('ViewMinimap', () => {
  // The Map's code loads on demand (docs/specs/016-platform/web-performance.md "Pictures of the board"), so it draws
  // once its import resolves.
  it('shows the Map, and hides it while the canvas is covered', async () => {
    const props = {} as Parameters<typeof ViewMinimap>[0];
    render(<ViewMinimap {...props} />);
    expect(await screen.findByText('Map')).toBeTruthy();
    cleanup();
    covered = true;
    render(<ViewMinimap {...props} />);
    expect(screen.queryByText('Map')).toBeNull();
  });
});
