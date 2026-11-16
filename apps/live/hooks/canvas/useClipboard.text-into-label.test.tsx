// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Element, ShapeElement } from '@livedoc/document';
import { serialiseElements } from '@/lib/clipboard-payload';
import { useClipboard } from './useClipboard';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn(), titleCaseType: (s: string) => s }));

// docs/specs/008-canvas/canvas-and-palette.md "Clipboard": text pasted onto one selected shape becomes its label.

const box: ShapeElement = {
  id: 'box',
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 160,
  height: 80,
  label: 'Old words',
};

type Setup = {
  selectedId?: string | null;
  multi?: string[];
  editingId?: string | null;
  isReadOnly?: boolean;
  takes?: boolean;
};

function harness({
  selectedId = 'box',
  multi = [],
  editingId = null,
  isReadOnly = false,
  takes = true,
}: Setup = {}) {
  let elements: Element[] = [box];
  const pasteTextIntoSelected = vi.fn((_id: string, _text: string) => takes);
  const { result } = renderHook(() =>
    useClipboard({
      isReadOnly,
      embedMode: false,
      readSelection: () => ({ selectedId, multiSelectedIds: new Set(multi) }),
      editingId,
      setEditingId: () => {},
      activeTab: { id: 't', name: 'Board', elements },
      commit: (m) => {
        elements = m(elements);
      },
      setSelectedId: () => {},
      setMultiSelectedIds: () => {},
      ownerId: 'me',
      documentId: 'd',
      toast: { error: vi.fn(), info: vi.fn() } as never,
      pasteTextIntoSelected,
    }),
  );
  return {
    elements: () => elements,
    pasteTextIntoSelected,
    copy: () => act(() => result.current.copySelection()),
  };
}

function paste(text: string, files: File[] = []): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/plain' ? text : ''), files, items: [] },
  });
  document.body.dispatchEvent(event);
  return event;
}

afterEach(cleanup);

describe('pasting text onto one selected shape', () => {
  it('hands the text to the selected shape as its new label', () => {
    const h = harness();
    const event = paste('Checkout service');
    expect(h.pasteTextIntoSelected).toHaveBeenCalledWith('box', 'Checkout service');
    expect(event.defaultPrevented).toBe(true);
    expect(h.elements()).toHaveLength(1);
  });

  it('keeps line breaks, as newlines', () => {
    const h = harness();
    paste('First line\r\nSecond line');
    expect(h.pasteTextIntoSelected).toHaveBeenCalledWith('box', 'First line\nSecond line');
  });

  it('leaves whitespace alone', () => {
    const h = harness();
    paste('  \n ');
    expect(h.pasteTextIntoSelected).not.toHaveBeenCalled();
  });

  it('pastes as before when the shape takes no label', () => {
    const h = harness({ takes: false });
    paste('Checkout service');
    expect(h.pasteTextIntoSelected).toHaveBeenCalled();
    expect(h.elements()).toEqual([box]);
  });

  it('pastes the in-app copy when its clipboard write was refused, the text being older', () => {
    const h = harness();
    h.copy();
    paste('Words copied before');
    expect(h.pasteTextIntoSelected).not.toHaveBeenCalled();
    expect(h.elements()).toHaveLength(2);
  });

  it.each([
    ['nothing is selected', { selectedId: null }],
    ['several are selected', { selectedId: null, multi: ['box', 'other'] }],
    ['a label is open for typing', { editingId: 'box' }],
    ['the session is view-only', { isReadOnly: true }],
  ] satisfies [string, Setup][])('does nothing when %s', (_name, setup) => {
    const h = harness(setup);
    paste('Checkout service');
    expect(h.pasteTextIntoSelected).not.toHaveBeenCalled();
  });

  it('pastes copied elements as elements, never as a label', () => {
    const h = harness();
    paste(serialiseElements([{ ...box, id: 'copied' }]));
    expect(h.pasteTextIntoSelected).not.toHaveBeenCalled();
    expect(h.elements()).toHaveLength(2);
  });
});
