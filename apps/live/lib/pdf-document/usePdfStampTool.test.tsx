// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Stamps" (Placing a stamp, The Stamp control, Insert > Stamp), "Telemetry and
// observability" (`Stamp.<Standard|Dynamic>` alone); reading-surface.md "The toolbar": Stamp.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import {
  PageName,
  PDF_MAX_MARKS,
  PdfLiveChanges,
  Stamps,
  type Box,
  type PageInfo,
} from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { STAMP_DYNAMIC, STAMP_STANDARD } from './pdf-menus';
import { STAMP_COLOURS } from './pdf-stamp';
import { resetStampPick, stampPick } from './pdf-stamp-pick';
import { TOO_MANY_MARKS_COPY } from './pdf-surface-copy';
import { STAMP_TOOLS } from './pdf-toolbar';
import type { PdfPageTool } from './usePdfMarkTools';
import { stampCell, usePdfStampTool } from './usePdfStampTool';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const PAGES = [PageName.ofObject(3), PageName.ofObject(4)].map((name) => ({ name }) as PageInfo);
const LETTER: Box = [0, 0, 612, 792];

function stampTool({
  offered = true,
  inHand = 'select',
}: { offered?: boolean; inHand?: PdfPageTool } = {}) {
  const doc = PdfLiveChanges.load();
  const steps: unknown[] = [];
  const ready = {
    pages: PAGES,
    storedFile: 'ab'.repeat(32) as BlobKey,
    binding: { doc } as never,
    undo: {
      step: <Made,>(place: unknown, made: () => Made) => {
        steps.push(place);
        return made();
      },
    } as never,
  };
  const pickTool = vi.fn();
  const onProblem = vi.fn();
  const hook = renderHook(
    (props: { inHand: PdfPageTool }) =>
      usePdfStampTool({
        ready,
        author: 'Ada Lovelace',
        authorKey: 'k-ada',
        offered,
        inHand: props.inHand,
        pickTool,
        onProblem,
      }),
    { initialProps: { inHand } },
  );
  const run = (id: string) => act(() => hook.result.current.actions[id]!.run());
  return { hook, run, doc, steps, pickTool, onProblem };
}

beforeEach(() => {
  vi.mocked(track).mockClear();
  vi.mocked(debugLog).mockClear();
});

afterEach(() => {
  localStorage.clear();
  resetStampPick();
});

describe('the Stamp control', () => {
  it('offers nothing while stamps may not be placed', () => {
    const { hook } = stampTool({ offered: false });
    expect(hook.result.current.actions).toEqual({});
    expect(hook.result.current.choices).toEqual({});
  });

  it('holds every stamp in a grid a category, each drawn in its colour, Approved until another is taken', () => {
    const { hook } = stampTool();
    const choice = hook.result.current.choices[STAMP_TOOLS]!;
    expect(choice.read()).toBe(stampCell('approved'));
    expect(choice.grid!.sections).toEqual([
      { label: 'Standard', count: Stamps.standard.length },
      { label: 'Dynamic', count: Stamps.dynamic.length },
    ]);
    expect(choice.grid!.cells[1]).toEqual({
      id: stampCell('not-approved'),
      label: 'Not approved',
      badge: { text: 'NOT APPROVED', detail: null, colour: STAMP_COLOURS.red },
    });
    expect(choice.grid!.cells.at(-1)).toMatchObject({
      label: 'Revised, with name and time',
      badge: { text: 'REVISED', detail: 'by name, time' },
    });
    expect(choice.iconOf!(null)).toBe(choice.iconOf!(stampCell('draft')));
    expect(hook.result.current.actions[STAMP_TOOLS]!.label).toBe('Stamp: Approved');
  });

  it('takes a stamp from its cell, remembered, and the tool in hand with it', () => {
    const { hook, run, pickTool } = stampTool();
    run(stampCell('received'));
    expect(stampPick()).toBe('received');
    expect(pickTool).toHaveBeenLastCalledWith('stamp');
    hook.rerender({ inHand: 'stamp' });
    expect(hook.result.current.actions[stampCell('received')]!.checked).toBe(true);
    expect(hook.result.current.actions[stampCell('approved')]!.checked).toBe(false);
    expect(hook.result.current.actions[STAMP_TOOLS]).toMatchObject({
      checked: true,
      label: 'Stamp: Received, with name and time',
    });
    expect(hook.result.current.choices[STAMP_TOOLS]!.read()).toBe(stampCell('received'));
  });

  it('takes the stamp it shows when pressed, and puts the tool down when pressed again', () => {
    const { hook, run, pickTool } = stampTool();
    run(STAMP_TOOLS);
    expect(pickTool).toHaveBeenLastCalledWith('stamp');
    hook.rerender({ inHand: 'stamp' });
    run(STAMP_TOOLS);
    expect(pickTool).toHaveBeenLastCalledWith('select');
  });
});

describe('Insert > Stamp', () => {
  it('takes the stamp shown where it is of the category, else the category’s first', () => {
    const { run } = stampTool();
    run(STAMP_DYNAMIC);
    expect(stampPick()).toBe('approved-by');
    run(stampCell('revised'));
    run(STAMP_DYNAMIC);
    expect(stampPick()).toBe('revised');
    run(STAMP_STANDARD);
    expect(stampPick()).toBe('approved');
    run(stampCell('sold'));
    run(STAMP_STANDARD);
    expect(stampPick()).toBe('sold');
  });
});

describe('placing a stamp', () => {
  it('gives the pages a press only with the Stamp tool in hand', () => {
    const { hook } = stampTool();
    expect(hook.result.current.stamping).toBeNull();
    hook.rerender({ inHand: 'stamp' });
    expect(hook.result.current.stamping).not.toBeNull();
  });

  it('places the stamp shown, one step of undo on its page, counted by its category alone', () => {
    const { hook, run, doc, steps, onProblem } = stampTool({ inHand: 'stamp' });
    act(() => hook.result.current.stamping!.onStamp(1, { x: 300, y: 400 }, LETTER));
    expect(PdfLiveChanges.marks(doc)).toEqual([
      expect.objectContaining({
        kind: 'stamp',
        stamp: 'approved',
        lines: ['APPROVED'],
        page: PAGES[1]!.name,
        author: 'Ada Lovelace',
        authorKey: 'k-ada',
      }),
    ]);
    expect(steps).toEqual([{ page: PAGES[1]!.name }]);
    expect(track).toHaveBeenCalledExactlyOnceWith('Pdf', 'Added', 'Stamp.Standard');
    expect(debugLog).toHaveBeenLastCalledWith('[pdf] mark-added kind=stamp');
    expect(onProblem).toHaveBeenLastCalledWith(null);
    run(stampCell('reviewed'));
    act(() => hook.result.current.stamping!.onStamp(0, { x: 300, y: 400 }, LETTER));
    // The marks come back by their ids, which are random: found by its stamp.
    const reviewed = PdfLiveChanges.marks(doc).find(
      (mark) => mark.kind === 'stamp' && mark.stamp !== 'approved',
    );
    expect(reviewed).toMatchObject({
      stamp: 'reviewed',
      lines: ['REVIEWED', expect.stringMatching(/^by Ada Lovelace, \d+ \w{3} \d{4}, \d\d:\d\d$/)],
    });
    expect(track).toHaveBeenLastCalledWith('Pdf', 'Added', 'Stamp.Dynamic');
  });

  it('places nothing on a page that is not there, or on a page with no room, and says so', () => {
    const { hook, doc, steps } = stampTool({ inHand: 'stamp' });
    act(() => hook.result.current.stamping!.onStamp(5, { x: 1, y: 1 }, LETTER));
    expect(steps).toEqual([]);
    const nowhere: Box = [Infinity, Infinity, -Infinity, -Infinity];
    act(() => hook.result.current.stamping!.onStamp(0, { x: 1, y: 1 }, nowhere));
    expect(debugLog).toHaveBeenLastCalledWith('[pdf] mark-refused name=no_stamp');
    expect(PdfLiveChanges.marks(doc)).toEqual([]);
  });

  it('is refused past PDF_MAX_MARKS, which the title row says', () => {
    const { hook, doc, onProblem } = stampTool({ inHand: 'stamp' });
    doc.transact(() => {
      const marks = doc.getMap('marks');
      for (let n = 0; n < PDF_MAX_MARKS; n += 1) marks.set(`m${n}`, 1);
    });
    act(() => hook.result.current.stamping!.onStamp(0, { x: 300, y: 400 }, LETTER));
    expect(onProblem).toHaveBeenLastCalledWith(TOO_MANY_MARKS_COPY);
    expect(debugLog).toHaveBeenLastCalledWith('[pdf] limit-refused name=pdf_too_many_marks');
  });

  it('places nothing before the PDF is open', () => {
    const pickTool = vi.fn();
    const hook = renderHook(() =>
      usePdfStampTool({
        ready: null,
        author: 'Ada',
        authorKey: null,
        offered: false,
        inHand: 'stamp',
        pickTool,
        onProblem: vi.fn(),
      }),
    );
    act(() => hook.result.current.stamping!.onStamp(0, { x: 1, y: 1 }, LETTER));
    expect(track).not.toHaveBeenCalled();
  });
});
