// @vitest-environment jsdom
import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { modalClosed, modalOpened } from '@/lib/modal-guard';
import {
  escapeReaches,
  heldEscapeLayers,
  resetEscapeLayersForTests,
  useEscapeLayer,
} from './useEscapeLayer';

// A layer Escape backs out of wherever the keyboard stands (docs/specs/004-interface-design/escape.md "The ladder").

afterEach(() => {
  cleanup();
  resetEscapeLayersForTests();
  document.body.innerHTML = '';
});

function place(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

describe('useEscapeLayer', () => {
  it('backs out of its layer on Escape from the page, and the key is spoken for', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeLayer('highlight', true, onEscape));
    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(false);
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('stops the key reaching the listeners behind it', () => {
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    renderHook(() => useEscapeLayer('highlight', true, () => {}));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    window.removeEventListener('keydown', behind);
    expect(behind).not.toHaveBeenCalled();
  });

  it('does nothing while inactive, and holds no layer', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeLayer('highlight', false, onEscape));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
    expect(heldEscapeLayers()).toEqual({});
  });

  it('ignores every other key and a key already claimed', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeLayer('highlight', true, onEscape));
    fireEvent.keyDown(document.body, { key: 'Enter' });
    const claimed = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    claimed.preventDefault();
    document.body.dispatchEvent(claimed);
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('leaves an Escape pressed in the surface that owns the layer to that surface', () => {
    const host = place('<aside data-owner><button>Term</button></aside>');
    const onEscape = vi.fn();
    renderHook(() => useEscapeLayer('highlight', true, onEscape, '[data-owner]'));
    fireEvent.keyDown(host.querySelector('button')!, { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('backs out on an Escape aimed at the document itself, which no surface owns', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeLayer('highlight', true, onEscape, '[data-owner]'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('leaves a field, a menu and a modal dialog their own Escape', () => {
    const host = place(
      '<input aria-label="Name" /><div data-menu-surface><button>Copy</button></div>',
    );
    const onEscape = vi.fn();
    renderHook(() => useEscapeLayer('highlight', true, onEscape));
    fireEvent.keyDown(host.querySelector('input')!, { key: 'Escape' });
    fireEvent.keyDown(host.querySelector('button')!, { key: 'Escape' });
    modalOpened();
    try {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    } finally {
      modalClosed();
    }
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('holds its layer while active and lets it go on unmount, counting each holder', () => {
    const first = renderHook(() => useEscapeLayer('highlight', true, () => {}));
    const second = renderHook(() => useEscapeLayer('highlight', true, () => {}));
    expect(heldEscapeLayers()).toEqual({ highlight: true });
    first.unmount();
    expect(heldEscapeLayers()).toEqual({ highlight: true });
    second.unmount();
    expect(heldEscapeLayers()).toEqual({});
  });
});

describe('the held layers', () => {
  it('never count below none when a holder lets go after a reset', () => {
    const first = renderHook(() => useEscapeLayer('highlight', true, () => {}));
    resetEscapeLayersForTests();
    first.unmount();
    renderHook(() => useEscapeLayer('highlight', true, () => {}));
    expect(heldEscapeLayers()).toEqual({ highlight: true });
  });
});

describe('escapeReaches', () => {
  it('reaches an outer layer only when no inner one is held', () => {
    expect(escapeReaches('selection', document.body)).toBe(true);
    renderHook(() => useEscapeLayer('highlight', true, () => {}));
    expect(escapeReaches('selection', document.body)).toBe(false);
    expect(escapeReaches('highlight', document.body)).toBe(true);
  });

  it('reaches nothing past a field holding focus', () => {
    const input = place('<input />').querySelector('input');
    expect(escapeReaches('highlight', input)).toBe(false);
    expect(escapeReaches('field', input)).toBe(true);
  });
});
