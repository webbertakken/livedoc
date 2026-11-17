import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { api, guest } = vi.hoisted(() => ({
  api: { apiLoadSelf: vi.fn(), apiSaveSelf: vi.fn() },
  guest: { ensureSignedGuestIdentity: vi.fn(async () => ({ id: 'g1', sig: 's' })) },
}));
vi.mock('@/lib/api-client', () => api);
vi.mock('@/lib/guest-identity', () => guest);

import { resolveParticipant } from './resolve-participant';

// docs/specs/016-platform/web-performance.md "The open never waits for a write".

beforeEach(() => {
  api.apiLoadSelf.mockReset();
  api.apiSaveSelf.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('resolveParticipant', () => {
  it('resolves a first visit before its new row is saved, as the participant it saves', async () => {
    api.apiLoadSelf.mockResolvedValue(null);
    api.apiSaveSelf.mockReturnValue(new Promise(() => {}));
    const self = await resolveParticipant({ accountId: null, accountDisplayName: null });
    expect(self).toMatchObject({ id: 'g1', status: 'online' });
    expect(api.apiSaveSelf).toHaveBeenCalledWith(self);
  });

  it('resolves a signed-in name change before it is saved', async () => {
    api.apiLoadSelf.mockResolvedValue({ id: 'acct', name: 'Old', color: '#f00', status: 'online' });
    api.apiSaveSelf.mockReturnValue(new Promise(() => {}));
    const self = await resolveParticipant({ accountId: 'acct', accountDisplayName: 'Ann' });
    expect(self.name).toBe('Ann');
    expect(api.apiSaveSelf).toHaveBeenCalledWith(self);
  });

  it('writes nothing for a returning reader whose row is current', async () => {
    api.apiLoadSelf.mockResolvedValue({ id: 'g1', name: 'Otter', color: '#f00', status: 'online' });
    await resolveParticipant({ accountId: null, accountDisplayName: null });
    expect(api.apiSaveSelf).not.toHaveBeenCalled();
  });

  it('logs a save that fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    api.apiLoadSelf.mockResolvedValue(null);
    api.apiSaveSelf.mockRejectedValue(new Error('500'));
    await resolveParticipant({ accountId: null, accountDisplayName: null });
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith('[participant] save_failed', expect.any(Error)),
    );
  });
});
