// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextRegion, regionStep, shownRegions, useRegionCycle } from './useRegionCycle';

// docs/specs/004-interface-design/canvas-accessibility.md "F6 moves between regions". jsdom lays nothing out, so a
// region counts as on screen unless it is hidden.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
    this: HTMLElement,
  ) {
    return (this.closest('.hidden') ? [] : [{}]) as unknown as DOMRectList;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Editor({ viewer = false }: { viewer?: boolean }) {
  return (
    <>
      <header data-region="header">
        <button>Title</button>
        <button>Share</button>
      </header>
      <main data-region="canvas" tabIndex={0} aria-label="Canvas">
        <div data-region="palette" className={viewer ? 'hidden' : ''}>
          <button>Shapes</button>
        </div>
        <div data-region="controls">
          <button disabled>Undo</button>
          <button>Layers</button>
        </div>
      </main>
      <nav data-region="tabs">
        <button>Tab 1</button>
      </nav>
    </>
  );
}

const press = (shift = false) => fireEvent.keyDown(window, { key: 'F6', shiftKey: shift });
const focused = () =>
  document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent;

describe('F6 between regions', () => {
  it('walks header, palette, canvas, controls and tabs in screen order, wrapping round', () => {
    render(<Editor />);
    renderHook(() => useRegionCycle());
    const seen = [];
    for (let i = 0; i < 6; i++) {
      press();
      seen.push(focused());
    }
    // The canvas lands on itself; the others on their first enabled control.
    expect(seen).toEqual(['Title', 'Shapes', 'Canvas', 'Layers', 'Tab 1', 'Title']);
  });

  it('walks back with Shift+F6', () => {
    render(<Editor />);
    renderHook(() => useRegionCycle());
    press(true);
    expect(focused()).toBe('Tab 1');
    press(true);
    expect(focused()).toBe('Layers');
  });

  it('skips a region not on screen (a viewer has no palette)', () => {
    render(<Editor viewer />);
    renderHook(() => useRegionCycle());
    press();
    press();
    expect(focused()).toBe('Canvas');
    expect(shownRegions(document).map((r) => r.dataset.region)).toEqual([
      'header',
      'canvas',
      'controls',
      'tabs',
    ]);
  });

  it('moves on from the innermost region (the palette sits inside the canvas)', () => {
    render(<Editor />);
    const regions = shownRegions(document);
    const shapes = document.querySelector('[data-region="palette"] button');
    expect(nextRegion(regions, shapes, false)?.dataset.region).toBe('canvas');
    expect(nextRegion(regions, shapes, true)?.dataset.region).toBe('header');
  });

  it('leaves a modal dialog its own focus', () => {
    render(
      <>
        <Editor />
        <div role="dialog" aria-modal="true">
          <button>Inside</button>
        </div>
      </>,
    );
    renderHook(() => useRegionCycle());
    const inside = document.querySelector<HTMLButtonElement>('[role="dialog"] button')!;
    inside.focus();
    press();
    expect(document.activeElement).toBe(inside);
  });
});

// A kind outside the canvas joins the cycle with the office shell's parts (canvas-accessibility.md, office-shell.md
// "Behaviour").
function OfficeEditor({ outline = false, sheet = false }: { outline?: boolean; sheet?: boolean }) {
  return (
    <>
      <header data-region="header">
        <a href="/explorer">Mark</a>
        <div role="menubar" data-region="menubar">
          <button tabIndex={-1}>File</button>
          <button tabIndex={0}>Edit</button>
        </div>
        <div role="toolbar" data-region="toolbar">
          <button tabIndex={0}>Undo</button>
        </div>
      </header>
      {sheet ? (
        <div data-region="formulabar">
          {/* The name box keeps its keys from the page, as the spreadsheet's does. */}
          <input aria-label="Name box" onKeyDown={(e) => e.stopPropagation()} />
        </div>
      ) : null}
      {outline ? (
        <aside data-region="left">
          <button>Heading</button>
        </aside>
      ) : null}
      <div data-region="document">
        <div role="textbox" tabIndex={0} aria-label="Document body" />
      </div>
      <nav data-region="tabs">
        <button>Tab 1</button>
      </nav>
    </>
  );
}

describe('F6 through the office shell', () => {
  it('walks the title row, menu bar, toolbar, left panel, document and tabs, on each tab stop', () => {
    render(<OfficeEditor outline />);
    renderHook(() => useRegionCycle());
    const seen = [];
    for (let i = 0; i < 7; i++) {
      press();
      seen.push(focused());
    }
    expect(seen).toEqual(['Mark', 'Edit', 'Undo', 'Heading', 'Document body', 'Tab 1', 'Mark']);
  });

  it('skips a panel not shown', () => {
    render(<OfficeEditor />);
    renderHook(() => useRegionCycle());
    press();
    press();
    press();
    press();
    expect(focused()).toBe('Document body');
  });
});

// grid-and-editing.md "Moving around": a spreadsheet's formula bar is an area of its own; Ctrl+Alt+. and , move too.
describe('the areas of a spreadsheet', () => {
  it('walks the formula bar after the toolbar, and Ctrl+Alt+. and , move on and back', () => {
    render(<OfficeEditor sheet />);
    renderHook(() => useRegionCycle());
    const ctrlAlt = (code: string) =>
      fireEvent.keyDown(document.activeElement ?? window, {
        key: code === 'Period' ? '.' : ',',
        code,
        ctrlKey: true,
        altKey: true,
      });
    for (let i = 0; i < 4; i++) ctrlAlt('Period');
    expect(focused()).toBe('Name box');
    ctrlAlt('Period');
    expect(focused()).toBe('Document body');
    ctrlAlt('Comma');
    expect(focused()).toBe('Name box');
    // Any other key, and a cycle turned off, leave focus where it is.
    fireEvent.keyDown(window, { key: 'a' });
    expect(focused()).toBe('Name box');
  });

  it('passes over a region with nothing to focus, and finds none among no regions', () => {
    render(
      <>
        <div data-region="toolbar">
          <button disabled>Undo</button>
        </div>
        <div data-region="formulabar">
          <input aria-label="Name box" />
        </div>
      </>,
    );
    renderHook(() => useRegionCycle());
    press();
    expect(focused()).toBe('Name box');
    expect(nextRegion([], null, false)).toBeNull();
  });

  it('does nothing while turned off', () => {
    render(<OfficeEditor sheet />);
    renderHook(() => useRegionCycle(false));
    press();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('regionStep', () => {
  const key = (init: KeyboardEventInit, altGraph = false) => {
    const e = new KeyboardEvent('keydown', init);
    vi.spyOn(e, 'getModifierState').mockReturnValue(altGraph);
    return e;
  };
  it('reads F6, Ctrl+Alt+. and Ctrl+Alt+, and leaves every other key', () => {
    expect(regionStep(key({ key: 'F6' }))).toBe('on');
    expect(regionStep(key({ key: 'F6', shiftKey: true }))).toBe('back');
    expect(regionStep(key({ key: 'F6', ctrlKey: true }))).toBeNull();
    expect(regionStep(key({ code: 'Period', ctrlKey: true, altKey: true }))).toBe('on');
    expect(regionStep(key({ code: 'Comma', ctrlKey: true, altKey: true }))).toBe('back');
    expect(regionStep(key({ code: 'KeyM', ctrlKey: true, altKey: true }))).toBeNull();
    expect(regionStep(key({ code: 'Period', ctrlKey: true }))).toBeNull();
    expect(
      regionStep(key({ code: 'Period', ctrlKey: true, altKey: true, shiftKey: true })),
    ).toBeNull();
    expect(regionStep(key({ code: 'Period', ctrlKey: true, altKey: true }, true))).toBeNull();
  });
});
