// @vitest-environment jsdom

// Back, the brand group's first control (docs/specs/007-editor/toolbar-layout.md "The top line"): a back caret and the
// logo, one link to the Explorer; in a workspace frame, back to where the document was opened from; in a frame with
// document scope, the Explorer in a new tab. Every one looks and answers the same.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXPLORER_LANDING_PATH } from '@/lib/explorer-landing';
import {
  WorkbenchSessionContext,
  type WorkbenchSession,
} from '@/components/providers/workbench-session-context';
import { BrandBack, useBackTarget, type BackTarget } from './BrandBack';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/telemetry', () => ({ track }));

afterEach(() => {
  cleanup();
  track.mockClear();
});

describe('BrandBack', () => {
  it('links to the Explorer with the caret and the mark, no wordmark', () => {
    render(<BrandBack target={{ kind: 'explorer' }} />);
    const link = screen.getByRole('link', { name: 'Back to the Explorer' });
    expect(link.getAttribute('href')).toBe(EXPLORER_LANDING_PATH);
    expect(link.querySelector('[data-back-caret]')).not.toBeNull();
    expect(link.querySelector('[data-logotype]')).toBeNull();
    // The caret leads, the mark (24px) follows.
    expect(link.firstElementChild?.hasAttribute('data-back-caret')).toBe(true);
    expect(link.querySelector('svg:not([data-back-caret])')?.getAttribute('class')).toContain(
      'size-6',
    );
  });

  it('draws the caret as the spec sizes it: 8 x 14, a 1.75 round stroke', () => {
    render(<BrandBack target={{ kind: 'explorer' }} />);
    const caret = document.querySelector('[data-back-caret]')!;
    // 14px tall; its 14px box trimmed 3px either side to the chevron's 8px.
    expect(caret.getAttribute('height')).toBe('14');
    expect(caret.getAttribute('class')).toContain('-mx-[3px]');
    expect(caret.getAttribute('stroke-width')).toBe('1.75');
    expect(caret.getAttribute('stroke-linecap')).toBe('round');
    // The spec's M6.5 1.5 1.5 7l5 5.5, centred in the 14-unit box.
    expect(caret.querySelector('path')?.getAttribute('d')).toBe('M9.5 1.5 4.5 7l5 5.5');
  });

  it('counts a press', () => {
    render(<BrandBack target={{ kind: 'explorer' }} />);
    const link = screen.getByRole('link', { name: 'Back to the Explorer' });
    link.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(link);
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'BrandBack');
  });

  it('in a workspace frame, goes back where the document was opened from', () => {
    const back = vi.fn();
    render(<BrandBack target={{ kind: 'frame', back, backTitle: 'Roadmap' }} />);
    const button = screen.getByRole('button', { name: 'Back' });
    expect(button.querySelector('[data-back-caret]')).not.toBeNull();
    fireEvent.click(button);
    expect(back).toHaveBeenCalledOnce();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('in a frame with document scope, opens the Explorer in a new tab, caret and all', () => {
    render(<BrandBack target={{ kind: 'explorer', newTab: true }} />);
    const link = screen.getByRole('link', { name: 'Back to the Explorer (opens in a new tab)' });
    expect(link.getAttribute('href')).toBe(EXPLORER_LANDING_PATH);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.firstElementChild?.hasAttribute('data-back-caret')).toBe(true);
    link.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(link);
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'BrandBack');
  });

  // I10 (docs/specs/013-workspace/workbench-embeds.md): never an inert mark; the same hit area, states and logo motion.
  it('looks and answers the same wherever it goes', () => {
    const controls = [
      render(<BrandBack target={{ kind: 'explorer' }} />).container,
      render(<BrandBack target={{ kind: 'explorer', newTab: true }} />).container,
      render(<BrandBack target={{ kind: 'frame', back: vi.fn(), backTitle: 'Roadmap' }} />)
        .container,
    ].map((c) => c.querySelector<HTMLElement>('a, button')!);
    const [app] = controls;
    for (const control of controls) {
      expect(control.className).toBe(app!.className);
      expect(control.className).toContain('hover:bg-slate-100');
      expect(control.className).toContain('focus-visible:ring-2');
      expect(control.hasAttribute('data-assemble')).toBe(true);
      expect(control.firstElementChild?.hasAttribute('data-back-caret')).toBe(true);
    }
  });

  it('tints the mark with the tab theme accent', () => {
    const plain = render(<BrandBack target={{ kind: 'explorer' }} />).container.querySelector(
      'stop',
    );
    const plainStop = plain?.getAttribute('style');
    cleanup();
    const tinted = render(<BrandBack target={{ kind: 'explorer' }} accent="#ff0000" />).container;
    expect(tinted.querySelector('stop')?.getAttribute('style')).not.toBe(plainStop);
  });
});

describe('useBackTarget', () => {
  function targetIn(session: Partial<WorkbenchSession> | null): BackTarget {
    let target: BackTarget | null = null;
    function Probe() {
      target = useBackTarget();
      return null;
    }
    render(
      <WorkbenchSessionContext.Provider value={session as WorkbenchSession | null}>
        <Probe />
      </WorkbenchSessionContext.Provider>,
    );
    return target!;
  }

  it('goes to the Explorer in the app', () => {
    expect(targetIn(null)).toEqual({ kind: 'explorer' });
  });

  it('in a frame with document scope, goes to the Explorer in a new tab', () => {
    expect(targetIn({ frame: null })).toEqual({ kind: 'explorer', newTab: true });
  });

  it('in a workspace frame, goes where the frame says', () => {
    const back = vi.fn();
    const frame = { back, backTitle: 'Roadmap', reportDocumentPlace: vi.fn() };
    expect(targetIn({ frame })).toEqual({ kind: 'frame', back, backTitle: 'Roadmap' });
  });
});
