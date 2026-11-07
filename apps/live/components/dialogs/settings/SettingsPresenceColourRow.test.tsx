// @vitest-environment jsdom

// Settings > Account's Colour (docs/specs/014-identity/auth-and-guest-access.md "Account settings"): the
// presence colour, chosen in place from the ten, put back newest-wins when refused.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PARTICIPANT_COLORS } from '@/lib/identity';
import { SETTINGS_CATEGORIES, type SettingsPresenceColourRowSpec } from './settings-catalogue';

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/components/providers/deferred-auth', () => ({ useDeferredAuth: () => auth.value }));
const self = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/api/self', () => ({ apiLoadSelf: self.load, apiSaveSelf: self.save }));
vi.mock('@/lib/local-identity', () => ({ getGuestSelfId: () => null }));
const telemetry = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => telemetry);

const { SettingsPresenceColourRow, COLOUR_FAILED } = await import('./SettingsPresenceColourRow');
const { onSelfColour } = await import('@/lib/self-presence');

const row = SETTINGS_CATEGORIES.flatMap((c) => c.rows).find(
  (r) => r.kind === 'presenceColour',
) as SettingsPresenceColourRowSpec;
const ADA = { id: 'acct_1', name: 'Ada', color: '#ef4444', status: 'online' as const };

const trigger = () => screen.getByRole('button', { name: /^Colour: / });
const pick = (name: string) => {
  fireEvent.click(trigger());
  const picker = screen.getByRole('group', { name: 'Your colour' });
  fireEvent.click(within(picker).getByRole('button', { name }));
};

beforeEach(() => {
  auth.value = { authLoaded: true, isSignedIn: true, accountId: 'acct_1', user: { id: 'acct_1' } };
  self.load.mockReset().mockResolvedValue(ADA);
  self.save.mockReset();
  telemetry.track.mockReset();
});
afterEach(cleanup);

describe('SettingsPresenceColourRow', () => {
  it('is a signed-in row in You, after Name', () => {
    const account = SETTINGS_CATEGORIES.find((c) => c.id === 'account')!;
    const keys = account.rows.map((r) => r.key);
    expect(keys.indexOf('presenceColour')).toBe(keys.indexOf('accountName') + 1);
    expect(row.section).toBe('You');
    expect(row.available?.({ signedIn: false } as never)).toBe(false);
  });

  it('names the colour in force and offers the ten presence colours, no custom ones', async () => {
    render(<SettingsPresenceColourRow row={row} />);
    await waitFor(() => expect(trigger().getAttribute('aria-label')).toBe('Colour: Red'));
    fireEvent.click(trigger());
    const picker = screen.getByRole('group', { name: 'Your colour' });
    expect(within(picker).getAllByRole('button')).toHaveLength(PARTICIPANT_COLORS.length);
    expect(screen.queryByRole('button', { name: 'Add a custom colour' })).toBeNull();
  });

  it('shows a pick at once, saves it, announces it and counts it', async () => {
    self.save.mockResolvedValue(undefined);
    const heard = vi.fn();
    const stop = onSelfColour(heard);
    render(<SettingsPresenceColourRow row={row} />);
    await waitFor(() => expect(trigger().getAttribute('aria-label')).toBe('Colour: Red'));
    pick('Sky');
    expect(trigger().getAttribute('aria-label')).toBe('Colour: Sky');
    expect(heard).toHaveBeenCalledWith({ id: 'acct_1', color: '#0ea5e9' });
    await waitFor(() => expect(self.save).toHaveBeenCalledWith({ ...ADA, color: '#0ea5e9' }));
    expect(telemetry.track).toHaveBeenCalledWith('UI', 'Changed', 'PresenceColour');
    stop();
  });

  it('puts back what the server last took when refused, newest wins', async () => {
    const answers: Array<(ok: boolean) => void> = [];
    self.save.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) =>
          answers.push((ok) => (ok ? resolve() : reject(new Error('refused')))),
        ),
    );
    render(<SettingsPresenceColourRow row={row} />);
    await waitFor(() => expect(trigger().getAttribute('aria-label')).toBe('Colour: Red'));
    pick('Sky');
    pick('Lime');
    // Two refusals in a row: never the first pick's Sky, which the server never stored.
    await act(async () => answers[0]!(false));
    expect(trigger().getAttribute('aria-label')).toBe('Colour: Lime');
    await act(async () => answers[1]!(false));
    expect(trigger().getAttribute('aria-label')).toBe('Colour: Red');
    expect(screen.getByText(COLOUR_FAILED)).toBeTruthy();
  });

  it('keeps a newer pick the server took when an older one is refused late', async () => {
    const answers: Array<(ok: boolean) => void> = [];
    self.save.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) =>
          answers.push((ok) => (ok ? resolve() : reject(new Error('refused')))),
        ),
    );
    render(<SettingsPresenceColourRow row={row} />);
    await waitFor(() => expect(trigger().getAttribute('aria-label')).toBe('Colour: Red'));
    pick('Sky');
    pick('Lime');
    await act(async () => answers[1]!(true));
    await act(async () => answers[0]!(false));
    expect(trigger().getAttribute('aria-label')).toBe('Colour: Lime');
    expect(screen.queryByText(COLOUR_FAILED)).toBeNull();
  });
});

// An account that never opened a document has no participant record yet: its colour is Automatic (one is given on
// the first open), and a pick makes the record.
describe('SettingsPresenceColourRow, before the first document', () => {
  beforeEach(() => {
    auth.value = {
      authLoaded: true,
      isSignedIn: true,
      accountId: 'acct_1',
      user: { id: 'acct_1', name: 'Ada', email: 'ada@example.com' },
    };
    self.load.mockReset().mockResolvedValue(null);
  });

  it('says Automatic, and a pick makes the record with the account name', async () => {
    self.save.mockResolvedValue(undefined);
    render(<SettingsPresenceColourRow row={row} />);
    await waitFor(() => expect(trigger().getAttribute('aria-label')).toBe('Colour: Automatic'));
    pick('Teal');
    expect(trigger().getAttribute('aria-label')).toBe('Colour: Teal');
    await waitFor(() =>
      expect(self.save).toHaveBeenCalledWith({
        id: 'acct_1',
        name: 'Ada',
        color: '#14b8a6',
        status: 'online',
      }),
    );
  });

  it('goes back to Automatic when that first pick is refused', async () => {
    self.save.mockRejectedValue(new Error('refused'));
    render(<SettingsPresenceColourRow row={row} />);
    await waitFor(() => expect(trigger().getAttribute('aria-label')).toBe('Colour: Automatic'));
    pick('Teal');
    await waitFor(() => expect(screen.getByText(COLOUR_FAILED)).toBeTruthy());
    expect(trigger().getAttribute('aria-label')).toBe('Colour: Automatic');
  });
});
