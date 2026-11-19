// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RoomHandlers } from '@/lib/api-client';

// A spreadsheet's settings saved through the api (docs/specs/029-sheets/sheet-store.md "Changing the workbook"):
// taken from the worker, never from a peer, since they change only through the api.

const { room } = vi.hoisted(() => ({ room: { handlers: null as RoomHandlers | null } }));
vi.mock('@/lib/api-client', () => ({
  apiCreateRoomTicket: vi.fn(async () => null),
  connectRoom: vi.fn((_doc: string, _self: unknown, handlers: RoomHandlers) => {
    room.handlers = handlers;
    return { send: vi.fn(), close: vi.fn(), updateSelf: vi.fn() };
  }),
}));

const { useRoomConnection } = await import('./useRoomConnection');

async function mount() {
  const receiveWorkbook = vi.fn();
  const self = { id: 'user_1', name: 'Me', color: '#0ea5e9', status: 'online' as const };
  renderHook(() =>
    useRoomConnection({
      ...({} as Parameters<typeof useRoomConnection>[0]),
      hydrated: true,
      documentId: 'doc-1',
      documentServerStored: true,
      enabled: true,
      documentTeamId: null,
      selfParticipant: self,
      sessionShareCode: null,
      lastSeenRef: { current: new Map() },
      selfParticipantRef: { current: self },
      saveBaseline: {
        tabs: { current: [] },
        name: { current: '' },
        journal: { current: { entries: [] } as never },
      },
      sessionShareCodeRef: { current: null },
      roomRef: { current: null },
      applyRemoteOp: vi.fn(),
      markSeen: vi.fn(),
      countAppliedOp: vi.fn(),
      setDocumentName: vi.fn(),
      markTabLoaded: vi.fn(),
      loadedTabIdsRef: { current: new Set() },
      receiveWorkbook,
    }),
  );
  await waitFor(() => expect(room.handlers).not.toBeNull());
  return { receiveWorkbook };
}

const op = {
  kind: 'workbook',
  rev: 2,
  workbook: {
    format: 'ods',
    settings: {
      locale: 'nl-NL',
      timeZone: 'Europe/Amsterdam',
      recalc: 'hour',
      iterate: { on: false, max: 50, threshold: 0.05 },
    },
  },
} as never;

describe('useRoomConnection and the workbook settings', () => {
  it('takes them from the worker', async () => {
    const { receiveWorkbook } = await mount();
    room.handlers!.onOp('system', op);
    expect(receiveWorkbook).toHaveBeenCalledWith(op);
  });

  it('ignores them from a peer', async () => {
    const { receiveWorkbook } = await mount();
    room.handlers!.onOp('peer', op);
    expect(receiveWorkbook).not.toHaveBeenCalled();
  });
});
