// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Stamps" (Placing a stamp, The Stamp control, Insert > Stamp), "Telemetry and
// observability" (`Stamp.<Standard|Dynamic>` alone); reading-surface.md "The toolbar": Stamp; custom-stamps.md
// "Making one", "Placing one": their stamps in the grid, Create custom stamp…, a press sending the picture first.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import {
  PageName,
  PDF_MAX_MARKS,
  PdfLiveChanges,
  Stamps,
  type Box,
  type CustomStampRecord,
  type PageInfo,
} from '@livedoc/pdf-documents';
import { resetCustomStamps } from './custom-stamps';
import { CUSTOM_STAMP_COPY } from './make-custom-stamp';
import { CUSTOM_STAMP_COLOUR } from './pdf-stamp';
import { resetStampPictureUrls } from './stamp-picture-urls';
import { CREATE_CUSTOM_STAMP_CELL, type PdfCustomStampsHome } from './usePdfCustomStamps';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { STAMP_CUSTOM, STAMP_DYNAMIC, STAMP_MANAGE, STAMP_STANDARD } from './pdf-menus';
import { STAMP_COLOURS } from './pdf-stamp';
import { resetStampPick, stampPick } from './pdf-stamp-pick';
import { TOO_MANY_MARKS_COPY } from './pdf-surface-copy';
import { STAMP_TOOLS } from './pdf-toolbar';
import type { PdfPageTool } from './usePdfMarkTools';
import type { PdfStampIdentity } from './usePdfStampIdentity';
import { stampCell, usePdfStampTool } from './usePdfStampTool';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
const api = vi.hoisted(() => ({
  apiListCustomStamps: vi.fn(async () => [] as CustomStampRecord[]),
  apiReadCustomStampPicture: vi.fn(),
  apiCreateCustomStamp: vi.fn(),
}));
vi.mock('@/lib/api/custom-stamps', () => api);
const kept = vi.hoisted(() => ({ readKept: vi.fn(), keepRead: vi.fn() }));
vi.mock('@/lib/offline/offline-blobs', () => ({ thisBrowserBlobs: () => kept }));

const PAGES = [PageName.ofObject(3), PageName.ofObject(4)].map((name) => ({ name }) as PageInfo);
const LETTER: Box = [0, 0, 612, 792];

const NO_IDENTITY: PdfStampIdentity = { identity: {}, keep: () => null };

function stampTool({
  offered = true,
  inHand = 'select',
  custom = null,
  identity = NO_IDENTITY,
}: {
  offered?: boolean;
  inHand?: PdfPageTool;
  custom?: PdfCustomStampsHome | null;
  identity?: PdfStampIdentity;
} = {}) {
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
        custom,
        identity,
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
  resetCustomStamps();
  resetStampPictureUrls();
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

  // marks.md "Stamps": a dynamic stamp placed is given the stamper's title and organisation, a standard one never.
  it('gives a dynamic stamp a third line from the person’s stamp identity', () => {
    const identity = {
      identity: { title: 'Chief Engineer', organisation: 'Analytical Ltd' },
      keep: () => null,
    };
    const { hook, run, doc } = stampTool({ inHand: 'stamp', identity });
    act(() => hook.result.current.stamping!.onStamp(0, { x: 300, y: 400 }, LETTER));
    run(stampCell('approved-by'));
    act(() => hook.result.current.stamping!.onStamp(0, { x: 300, y: 200 }, LETTER));
    const lines = PdfLiveChanges.marks(doc).map((mark) =>
      mark.kind === 'stamp' ? mark.lines : [],
    );
    expect(lines).toContainEqual(['APPROVED']);
    expect(lines).toContainEqual([
      'APPROVED',
      expect.stringMatching(/^by Ada Lovelace, /),
      'Chief Engineer, Analytical Ltd',
    ]);
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
        custom: null,
        identity: NO_IDENTITY,
      }),
    );
    act(() => hook.result.current.stamping!.onStamp(0, { x: 1, y: 1 }, LETTER));
    expect(track).not.toHaveBeenCalled();
  });
});

// custom-stamps.md "Managing them": Manage stamps is offered wherever the Stamp tool is, for its Identity.
describe('Manage stamps without file storage', () => {
  it('opens with the identity alone, no custom stamps offered', () => {
    const { hook, run } = stampTool();
    expect(hook.result.current.actions[STAMP_CUSTOM]).toBeUndefined();
    run(STAMP_MANAGE);
    expect(hook.result.current.manageStampsDialog).toMatchObject({
      open: true,
      customs: false,
      identity: NO_IDENTITY,
    });
  });

  it('is not offered while stamps may not be placed', () => {
    const { hook } = stampTool({ offered: false });
    expect(hook.result.current.actions[STAMP_MANAGE]).toBeUndefined();
  });
});

describe('custom stamps', () => {
  const PAID: CustomStampRecord = {
    id: 'custom-0b7c3c2e-5a8f-4f21-9a43-1f2d3e4c5b6a',
    name: 'Paid',
    category: 'Accounts',
    picture: { key: 'cd'.repeat(32) as BlobKey, type: 'png', width: 80, height: 40 },
    natural: { width: 60, height: 30 },
    createdAt: 2,
    updatedAt: 2,
  };
  const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  let send: ReturnType<typeof vi.fn<PdfCustomStampsHome['send']>>;
  beforeEach(() => {
    send = vi.fn<PdfCustomStampsHome['send']>(async () => {});
    api.apiListCustomStamps.mockResolvedValue([PAID]);
    kept.readKept.mockResolvedValue(BYTES);
    URL.createObjectURL = vi.fn(() => 'blob:paid');
    URL.revokeObjectURL = vi.fn();
  });
  const withCustom = (inHand: PdfPageTool = 'select') =>
    stampTool({ inHand, custom: { ownerId: 'ada', send } });

  it('offers none, nor Create custom stamp…, without file storage', () => {
    const { hook } = stampTool();
    const grid = hook.result.current.choices[STAMP_TOOLS]!.grid!;
    expect(grid.cells.map((cell) => cell.id)).not.toContain(CREATE_CUSTOM_STAMP_CELL);
    expect(hook.result.current.actions[STAMP_CUSTOM]).toBeUndefined();
  });

  it('draws theirs a category each after Standard and Dynamic, then Create custom stamp…', async () => {
    const { hook } = withCustom();
    await vi.waitFor(() =>
      expect(hook.result.current.choices[STAMP_TOOLS]!.grid!.sections!.map((s) => s.label)).toEqual(
        ['Standard', 'Dynamic', 'Accounts', ''],
      ),
    );
    await vi.waitFor(() =>
      expect(hook.result.current.choices[STAMP_TOOLS]!.grid!.cells.slice(-2)).toEqual([
        { id: stampCell(PAID.id), label: 'Paid', picture: { src: 'blob:paid', name: 'Paid' } },
        expect.objectContaining({ id: CREATE_CUSTOM_STAMP_CELL, command: true }),
      ]),
    );
  });

  it('opens Create custom stamp from the grid and from Insert > Stamp > Custom stamps', async () => {
    const { hook, run } = withCustom();
    await vi.waitFor(() => expect(hook.result.current.actions[STAMP_CUSTOM]).toBeDefined());
    run(STAMP_CUSTOM);
    expect(hook.result.current.customStampDialog).toMatchObject({ open: true, ownerId: 'ada' });
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'PdfDocumentCustomStampDialog');
    act(() => hook.result.current.customStampDialog.onClose());
    run(CREATE_CUSTOM_STAMP_CELL);
    expect(hook.result.current.customStampDialog.open).toBe(true);
  });

  // custom-stamps.md "Managing them": Insert > Stamp > Manage stamps opens it; its Create opens Create custom stamp.
  it('opens Manage stamps, with their stamps, and Create from it', async () => {
    const { hook, run } = withCustom();
    await vi.waitFor(() => expect(hook.result.current.actions[STAMP_MANAGE]).toBeDefined());
    run(STAMP_MANAGE);
    expect(hook.result.current.manageStampsDialog).toMatchObject({
      open: true,
      customs: true,
      ownerId: 'ada',
    });
    expect(hook.result.current.manageStampsDialog.stamps).toEqual([PAID]);
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'PdfDocumentManageStampsDialog');
    act(() => hook.result.current.manageStampsDialog.onCreate());
    expect(hook.result.current.manageStampsDialog.open).toBe(false);
    expect(hook.result.current.customStampDialog.open).toBe(true);
  });

  it('takes one made, the Stamp tool in hand', async () => {
    const { hook, pickTool } = withCustom();
    await vi.waitFor(() => expect(hook.result.current.actions[stampCell(PAID.id)]).toBeDefined());
    act(() => hook.result.current.customStampDialog.onMade(PAID));
    expect(stampPick()).toBe(PAID.id);
    expect(pickTool).toHaveBeenCalledWith('stamp');
    expect(hook.result.current.actions[STAMP_TOOLS]!.label).toBe('Stamp: Paid');
  });

  it('places one by its picture sent for the document first, counted as Custom', async () => {
    const { hook, run, doc, onProblem } = withCustom('stamp');
    await vi.waitFor(() => expect(hook.result.current.actions[stampCell(PAID.id)]).toBeDefined());
    run(stampCell(PAID.id));
    act(() => hook.result.current.stamping!.onStamp(0, { x: 100, y: 100 }, LETTER));
    // A press while the picture is sent places nothing more.
    act(() => hook.result.current.stamping!.onStamp(0, { x: 300, y: 300 }, LETTER));
    await vi.waitFor(() => expect(PdfLiveChanges.marks(doc)).toHaveLength(1));
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(PAID.picture.key, BYTES);
    expect(PdfLiveChanges.marks(doc)[0]).toMatchObject({
      stamp: PAID.id,
      lines: ['Paid'],
      picture: PAID.picture,
      colour: CUSTOM_STAMP_COLOUR,
      rect: [70, 85, 130, 115],
    });
    expect(track).toHaveBeenCalledWith('Pdf', 'Added', 'Stamp.Custom');
    expect(onProblem).toHaveBeenLastCalledWith(null);
  });

  it('places nothing where its picture cannot be sent, and says so', async () => {
    send.mockRejectedValue(new TypeError('offline'));
    const { hook, run, doc, onProblem } = withCustom('stamp');
    await vi.waitFor(() => expect(hook.result.current.actions[stampCell(PAID.id)]).toBeDefined());
    run(stampCell(PAID.id));
    act(() => hook.result.current.stamping!.onStamp(0, { x: 100, y: 100 }, LETTER));
    await vi.waitFor(() =>
      expect(onProblem).toHaveBeenLastCalledWith(CUSTOM_STAMP_COPY.not_placed),
    );
    expect(PdfLiveChanges.marks(doc)).toEqual([]);
  });

  it('shows Approved for a custom stamp that is theirs no longer', async () => {
    localStorage.setItem('livedoc:v2:pdf-stamp', 'custom-1b7c3c2e-5a8f-4f21-9a43-1f2d3e4c5b6a');
    resetStampPick();
    const { hook } = withCustom();
    await vi.waitFor(() => expect(hook.result.current.actions[stampCell(PAID.id)]).toBeDefined());
    expect(hook.result.current.actions[STAMP_TOOLS]!.label).toBe('Stamp: Approved');
    expect(hook.result.current.choices[STAMP_TOOLS]!.read()).toBe(stampCell('approved'));
  });
});
