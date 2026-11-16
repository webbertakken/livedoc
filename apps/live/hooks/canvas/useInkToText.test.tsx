// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  packFreehandPoints,
  type Element,
  type FreehandElement,
  type Tab,
} from '@livedoc/document';
import { useInkToText, type InkToTextDeps } from './useInkToText';

// docs/specs/023-draw-mode/ink-to-text.md
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  selectReader: vi.fn(),
  track: vi.fn(),
  image: vi.fn<() => string | null>(() => 'data:image/png;base64,AAAA'),
}));
vi.mock('@/lib/reading/select', () => ({ selectReader: mocks.selectReader }));
vi.mock('@/lib/telemetry', () => ({ track: mocks.track }));
vi.mock('@/lib/ink-to-text/ink-image', () => ({ inkImage: mocks.image }));

const stroke = (id: string, x: number, over: Partial<FreehandElement> = {}): FreehandElement =>
  ({
    id,
    type: 'freehand',
    closed: false,
    ...packFreehandPoints([
      { x, y: 0 },
      { x: x + 40, y: 30 },
    ]),
    ...over,
  }) as FreehandElement;

function setup(
  over: Partial<InkToTextDeps> = {},
  elements: Element[] = [stroke('a', 0), stroke('b', 60)],
) {
  const tab = { id: 't', name: 'Tab', elements } as Tab;
  const state = { elements: [...elements] };
  const commit = vi.fn((map: (els: Element[]) => Element[]) => {
    state.elements = map(state.elements);
  });
  const toast = { info: vi.fn(), error: vi.fn() };
  const deps: InkToTextDeps = {
    activeTab: tab,
    selectionIds: () => new Set(['a', 'b']),
    layerLockedIds: new Set(),
    commit,
    readOnly: false,
    createBlocked: false,
    aiEnabled: true,
    ownerId: 'me',
    toast,
    selectOnly: vi.fn(),
    ...over,
  };
  const view = renderHook((d: InkToTextDeps) => useInkToText(d), { initialProps: deps });
  return { view, deps, state, commit, toast };
}

beforeEach(() => {
  mocks.selectReader.mockReturnValue({ kind: 'server', read: mocks.read });
  mocks.read.mockResolvedValue({
    textById: new Map([[1, { text: 'Order placed', legible: true }]]),
  });
  mocks.image.mockReturnValue('data:image/png;base64,AAAA');
});
afterEach(() => vi.clearAllMocks());

describe('useInkToText', () => {
  it('is offered on a selection of pen strokes to someone who may edit', () => {
    expect(setup().view.result.current.canConvertToText()).toBe(true);
    expect(setup({ readOnly: true }).view.result.current.canConvertToText()).toBe(false);
    expect(setup({ createBlocked: true }).view.result.current.canConvertToText()).toBe(false);
    expect(setup({ selectionIds: () => new Set() }).view.result.current.canConvertToText()).toBe(
      false,
    );
  });

  it('reads the ink through the photo import’s reader and swaps it for the text in one edit', async () => {
    const { view, state, commit, toast, deps } = setup();
    await act(() => view.result.current.convertToText());
    expect(mocks.selectReader).toHaveBeenCalledWith({ aiEnabled: true, ownerId: 'me' });
    expect(mocks.read).toHaveBeenCalledWith([{ id: 1, image: 'data:image/png;base64,AAAA' }], {});
    expect(toast.info).toHaveBeenCalledWith('Reading your handwriting…');
    expect(commit).toHaveBeenCalledOnce();
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0]).toMatchObject({
      type: 'text',
      label: 'Order placed',
      font: 'caveat',
    });
    expect(deps.selectOnly).toHaveBeenCalledWith(state.elements[0]!.id);
    expect(mocks.track).toHaveBeenCalledWith('AI', 'Used', 'InkToText');
  });

  it('changes nothing and says so when no words could be read', async () => {
    mocks.read.mockResolvedValue({ textById: new Map([[1, { text: '', legible: false }]]) });
    const { view, commit, toast } = setup();
    await act(() => view.result.current.convertToText());
    expect(commit).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('No words could be read in that handwriting.');
    expect(mocks.track).toHaveBeenCalledWith('Error', 'Warning', 'InkToText');
  });

  it('changes nothing and says so when the reader fails, or reads nothing for the picture', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.read.mockRejectedValue(new Error('ai_error'));
    const failing = setup();
    await act(() => failing.view.result.current.convertToText());
    expect(failing.commit).not.toHaveBeenCalled();
    expect(failing.toast.error).toHaveBeenCalledWith(
      'The handwriting could not be read just now. Try again in a moment.',
    );
    mocks.read.mockRejectedValue('offline');
    const thrown = setup();
    await act(() => thrown.view.result.current.convertToText());
    expect(warn).toHaveBeenCalledWith('[ink-to-text] the reader failed: offline');
    mocks.read.mockResolvedValue({ textById: new Map(), failure: 'ai_quota' });
    const partial = setup();
    await act(() => partial.view.result.current.convertToText());
    expect(partial.toast.error).toHaveBeenCalledWith(
      'The handwriting could not be read just now. Try again in a moment.',
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('changes nothing where the browser cannot draw the picture', async () => {
    mocks.image.mockReturnValue(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { view, commit, toast } = setup();
    await act(() => view.result.current.convertToText());
    expect(mocks.read).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does nothing where it is not offered', async () => {
    const { view } = setup({ readOnly: true });
    await act(() => view.result.current.convertToText());
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('reads once however often it is asked while reading', async () => {
    let finish: (v: unknown) => void = () => {};
    mocks.read.mockReturnValue(new Promise((r) => (finish = r)));
    const { view } = setup();
    let first!: Promise<void>;
    act(() => {
      first = view.result.current.convertToText();
      void view.result.current.convertToText();
    });
    finish({ textById: new Map([[1, { text: 'Hi', legible: true }]]) });
    await act(() => first);
    expect(mocks.read).toHaveBeenCalledOnce();
  });

  it('leaves the canvas alone when the ink changed while it was read', async () => {
    let finish: (v: unknown) => void = () => {};
    mocks.read.mockReturnValue(new Promise((r) => (finish = r)));
    const { view, deps, commit, toast } = setup();
    let run!: Promise<void>;
    act(() => {
      run = view.result.current.convertToText();
    });
    view.rerender({ ...deps, activeTab: { ...deps.activeTab, elements: [stroke('a', 0)] } });
    finish({ textById: new Map([[1, { text: 'Hi', legible: true }]]) });
    await act(() => run);
    expect(commit).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('The handwriting changed while it was being read.');
  });

  it.each([
    ['the session lost its edit right', { readOnly: true }],
    ['creating was blocked', { createBlocked: true }],
  ])('leaves the canvas alone when %s while it was read', async (_why, over) => {
    let finish: (v: unknown) => void = () => {};
    mocks.read.mockReturnValue(new Promise((r) => (finish = r)));
    const { view, deps, commit } = setup();
    let run!: Promise<void>;
    act(() => {
      run = view.result.current.convertToText();
    });
    view.rerender({ ...deps, ...over });
    finish({ textById: new Map([[1, { text: 'Hi', legible: true }]]) });
    await act(() => run);
    expect(commit).not.toHaveBeenCalled();
  });
});
