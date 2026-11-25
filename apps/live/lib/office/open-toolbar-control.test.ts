// @vitest-environment jsdom
// marks.md "Changing a mark": Format > Colour and Fill colour open the toolbar's Colour and Fill, on the bar or in More.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openToolbarControl } from './open-toolbar-control';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
const { debugLog } = await import('@/lib/debug-log');

afterEach(() => {
  document.body.innerHTML = '';
  vi.mocked(debugLog).mockClear();
});

function button(id: string, hidden = false): HTMLButtonElement {
  const slot = document.createElement('span');
  slot.hidden = hidden;
  const control = document.createElement('button');
  control.dataset.officeControl = id;
  slot.append(control);
  document.body.append(slot);
  return control;
}

describe('opening a toolbar control', () => {
  it('presses the control where the bar shows it', () => {
    const control = button('colour-control');
    const pressed = vi.fn();
    control.addEventListener('click', pressed);
    expect(openToolbarControl('colour-control')).toBe(true);
    expect(pressed).toHaveBeenCalledOnce();
  });

  it('opens More first for a control the bar has moved there, then presses it once More shows it', () => {
    const hidden = button('fill-colour-control', true);
    const more = button('more');
    more.setAttribute('aria-expanded', 'false');
    const pressed = vi.fn();
    more.addEventListener('click', () => {
      more.setAttribute('aria-expanded', 'true');
      button('fill-colour-control').addEventListener('click', pressed);
    });
    hidden.addEventListener('click', () => {
      throw new Error('the hidden one is never pressed');
    });
    let next: (() => void) | null = null;
    expect(openToolbarControl('fill-colour-control', document, (run) => (next = run))).toBe(true);
    expect(pressed).not.toHaveBeenCalled();
    next!();
    expect(pressed).toHaveBeenCalledOnce();
  });

  it('says so, and presses nothing, where the toolbar holds no such control', () => {
    button('more');
    expect(openToolbarControl('colour-control')).toBe(false);
    expect(debugLog).toHaveBeenCalledWith('[office] control-missing id=colour-control');
  });

  it('says so where More never shows it', () => {
    button('line-width-control', true);
    const more = button('more');
    more.setAttribute('aria-expanded', 'true');
    let next: (() => void) | null = null;
    openToolbarControl('line-width-control', document, (run) => (next = run));
    next!();
    expect(debugLog).toHaveBeenCalledWith('[office] control-missing id=line-width-control');
  });
});
