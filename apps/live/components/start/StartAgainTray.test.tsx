// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { showStart, startShown } from './start-shown';
import { StartAgainTray } from './StartAgainTray';

// docs/specs/007-editor/start-diagramming.md "Bringing it back"
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('StartAgainTray', () => {
  it('says nothing while the start is open', () => {
    showStart('t:draw');
    render(<StartAgainTray mode="draw" tabId="t" tabName="Tab 1" />);
    expect(screen.queryByText(/is empty/)).toBeNull();
  });

  it('on an empty tab without a palette strip (Draw), offers Show Templates as a pill, which opens the start', () => {
    render(<StartAgainTray mode="draw" tabId="t" tabName="Tab 1" />);
    expect(screen.getByText(/Tab 1 is empty/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show Templates' }));
    expect(startShown('t:draw')).toBe(true);
    expect(screen.queryByText(/is empty/)).toBeNull();
  });
});

describe('pillPlace', () => {
  it('stands the pill clear of Draw’s dock: under a top dock, over a bottom one', async () => {
    const { pillPlace } = await import('./StartAgainTray');
    expect(pillPlace({ top: 12, bottom: 60 }, 900)).toEqual({ top: 70 });
    expect(pillPlace({ top: 830, bottom: 880 }, 900)).toEqual({ bottom: 80 });
    expect(pillPlace(null, 900)).toEqual({ top: 80 });
  });
});
