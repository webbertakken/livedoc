// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StartFromTemplates } from './StartFromTemplates';
import { showStart, startShown } from './start-shown';

// docs/specs/007-editor/start-diagramming.md
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const mount = (mode: 'diagram' | 'workshop', onTemplate = vi.fn(), asked = true) => {
  if (asked) showStart(`t1:${mode}`);
  return render(
    <StartFromTemplates
      key={mode}
      mode={mode}
      tabId="t1"
      onTemplate={onTemplate}
      onOtherModeTemplate={vi.fn()}
    />,
  );
};

describe('StartFromTemplates', () => {
  it('names each mode its own start', () => {
    mount('diagram');
    expect(screen.getByRole('heading', { name: 'Start Diagramming' })).toBeTruthy();
    cleanup();
    mount('workshop');
    expect(screen.getByRole('heading', { name: 'Start a Workshop' })).toBeTruthy();
  });

  it('lands a chosen template, and a blank closes the panel', () => {
    const onTemplate = vi.fn();
    mount('diagram', onTemplate);
    fireEvent.click(document.querySelector('[data-start-card="flowchart"]')!);
    expect(onTemplate).toHaveBeenCalledWith('flowchart');
    fireEvent.click(document.querySelector('[data-start-card="blank"]')!);
    expect(onTemplate).toHaveBeenCalledWith('blank');
    expect(screen.queryByRole('heading', { name: 'Start Diagramming' })).toBeNull();
  });

  it('stays closed on an empty tab until asked for', () => {
    mount('diagram', vi.fn(), false);
    expect(screen.queryByRole('heading', { name: 'Start Diagramming' })).toBeNull();
  });

  it('remembers a close per tab and mode', () => {
    mount('diagram');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('heading', { name: 'Start Diagramming' })).toBeNull();
    expect(startShown('t1:diagram')).toBe(false);
    cleanup();
    mount('diagram', vi.fn(), false);
    expect(screen.queryByRole('heading', { name: 'Start Diagramming' })).toBeNull();
    cleanup();
    showStart('t1:workshop');
    mount('workshop', vi.fn(), false);
    expect(screen.getByRole('heading', { name: 'Start a Workshop' })).toBeTruthy();
  });

  it('closes on Escape once its search has nothing to clear', () => {
    mount('diagram');
    const search = screen.getByRole('textbox', { name: 'Find a template' });
    fireEvent.change(search, { target: { value: 'mind' } });
    fireEvent.keyDown(search, { key: 'Escape' });
    expect((search as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('heading', { name: 'Start Diagramming' })).toBeTruthy();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'Start Diagramming' })).toBeNull();
  });
});

// docs/specs/007-editor/start-diagramming.md "On a phone": the sheet stands on the bottom line while it shows, so the tabs
// stay in reach; with the bars folded away (a sideways phone) there is nothing to stand on.
describe('StartFromTemplates on a phone', () => {
  const frameOf = () =>
    screen.getByRole('heading', { name: 'Start Diagramming' }).closest('section')!.parentElement!;

  it('stands on the edge with no bottom line showing', () => {
    mount('diagram');
    expect(frameOf().className).toContain('max-sm:pb-[calc(var(--start-floor)-8px)]');
    expect(frameOf().style.getPropertyValue('--start-floor')).toBe('16px');
  });

  it('stands on the bottom line where it shows', () => {
    const bar = document.createElement('div');
    bar.setAttribute('data-bottom-line', '');
    bar.getBoundingClientRect = () =>
      ({ top: 616, left: 0, right: 390, width: 390, height: 48 }) as DOMRect;
    document.body.appendChild(bar);
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 664);
    try {
      mount('diagram');
      expect(frameOf().style.getPropertyValue('--start-floor')).toBe('56px');
    } finally {
      vi.unstubAllGlobals();
      bar.remove();
    }
  });
});

describe('StartFromTemplates, switching category', () => {
  it('opens the picked category at the top of its cards', () => {
    mount('diagram');
    const scroller = document.querySelector('[data-start-card]')!.closest('.overflow-y-auto')!;
    scroller.scrollTop = 300;
    fireEvent.click(document.querySelector('[data-rail="flowcharts"]')!);
    expect(scroller.scrollTop).toBe(0);
  });
});
