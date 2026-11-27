// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Deleting": a drawing tab no picture names is removed once when an Editor next
// opens the text document, its writing loaded; one someone is in, or one waiting here to be placed, is kept.
// review.md "Drawings": a suggestion settled that leaves a drawing tab named by no picture removes it at once.
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TextDocumentState } from '@livedoc/text-documents';
import { putDrawingPending, takeDrawing } from '@/lib/text-document/text-document-drawing-pending';
import { TEXT_DOCUMENT_SUGGESTIONS_ORIGIN } from '@/lib/text-document/text-document-undo';
import {
  orphanDrawings,
  settledOrphans,
  useTextDocumentDrawingOrphans,
} from './useTextDocumentDrawingOrphans';

const names = new Map([['named', 1]]);
// What the pictures name now: `names` unless a test settles something.
let current: ReadonlyMap<string, number> = names;
vi.spyOn(TextDocumentState, 'drawingNames').mockImplementation(() => current);

function sweeping({ ready = true, canEdit = true, held = true } = {}) {
  const remove = vi.fn();
  const drawingTabs = {
    opens: () => true,
    open: vi.fn(),
    drawingOf: () => 'w',
    copy: () => null,
    ids: () => ['named', 'orphan', 'busy', 'waiting'],
    someoneIn: (id: string) => id === 'busy',
    remove,
    draw: async () => null,
  };
  const liveDoc = { current: held ? TextDocumentState.load() : null };
  const hook = renderHook(
    (props: { ready: boolean }) =>
      useTextDocumentDrawingOrphans({
        ready: props.ready,
        canEdit,
        tabId: 'w',
        liveDoc,
        drawingTabs,
      }),
    { initialProps: { ready } },
  );
  return { remove, hook, liveDoc };
}

beforeEach(() => {
  sessionStorage.clear();
  putDrawingPending('waiting', { textDocumentTabId: 'w', documentTab: 't.0', anchor: null });
});

describe('orphanDrawings', () => {
  it('keeps those named, and those kept', () => {
    expect(orphanDrawings(['a', 'b', 'c'], new Map([['a', 2]]), (id) => id === 'c')).toEqual(['b']);
  });
});

describe('useTextDocumentDrawingOrphans', () => {
  it('removes the drawings no picture names once the writing has loaded, keeping those in use', () => {
    const { remove, hook } = sweeping();
    expect(remove).toHaveBeenCalledExactlyOnceWith(['orphan']);
    hook.rerender({ ready: true });
    expect(remove).toHaveBeenCalledTimes(1);
    takeDrawing('waiting');
  });

  it('waits for the writing, and sweeps then', () => {
    const { remove, hook } = sweeping({ ready: false });
    expect(remove).not.toHaveBeenCalled();
    hook.rerender({ ready: true });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('removes nothing for anyone who may not edit, or without the live state', () => {
    expect(sweeping({ canEdit: false }).remove).not.toHaveBeenCalled();
    expect(sweeping({ held: false }).remove).not.toHaveBeenCalled();
  });

  it('removes nothing when every drawing is in use', () => {
    names.set('orphan', 1);
    expect(sweeping().remove).not.toHaveBeenCalled();
    names.delete('orphan');
  });
});

describe('settledOrphans', () => {
  it('names the drawings a settle left with no picture, keeping those in use', () => {
    const before = new Map([
      ['kept', 1],
      ['gone', 1],
      ['busy', 1],
    ]);
    expect(settledOrphans(before, new Map([['kept', 1]]), (id) => id === 'busy')).toEqual(['gone']);
  });
});

describe('a suggestion settled', () => {
  const settle = (doc: ReturnType<typeof TextDocumentState.load>, after: Map<string, number>) =>
    doc.transact(() => {
      current = after;
      doc.getMap('settled').set('x', 1);
    }, TEXT_DOCUMENT_SUGGESTIONS_ORIGIN);

  it('removes at once a drawing tab its settle left named by no picture', async () => {
    current = new Map([...names, ['copy', 1]]);
    const { remove, liveDoc } = sweeping();
    remove.mockClear();
    settle(liveDoc.current!, new Map(names));
    await Promise.resolve();
    expect(remove).toHaveBeenCalledExactlyOnceWith(['copy']);
    current = names;
  });

  it('removes nothing for an edit that settles nothing, or for anyone who may not edit', async () => {
    current = new Map([...names, ['copy', 1]]);
    const { remove, liveDoc } = sweeping();
    remove.mockClear();
    liveDoc.current!.transact(() => {
      current = new Map(names);
      liveDoc.current!.getMap('settled').set('x', 1);
    });
    const viewer = sweeping({ canEdit: false });
    current = new Map([...names, ['copy', 1]]);
    settle(viewer.liveDoc.current!, new Map(names));
    await Promise.resolve();
    expect(remove).not.toHaveBeenCalled();
    expect(viewer.remove).not.toHaveBeenCalled();
    current = names;
  });
});
