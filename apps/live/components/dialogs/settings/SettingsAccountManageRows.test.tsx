// @vitest-environment jsdom

// Settings > Account, signed in: the name, the sign-in methods and the sessions
// (docs/specs/014-identity/auth-and-guest-access.md).

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SETTINGS_CATEGORIES,
  type SettingsAccountNameRowSpec,
  type SettingsSessionsRowSpec,
  type SettingsSignInMethodsRowSpec,
  type SettingsSignOutRowSpec,
} from './settings-catalogue';

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/components/providers/deferred-auth', () => ({ useDeferredAuth: () => auth.value }));
const config = vi.hoisted(() => ({ methods: ['google', 'email-code'] as string[] }));
vi.mock('@/lib/auth-config', () => ({ useAuthConfig: () => config }));
vi.mock('@/components/chrome/auth-shared', () => ({
  useAuthReturnPath: () => '/explorer?settings=account',
  authHrefWithReturn: (path: string, returnTo: string) =>
    `${path}?redirect_url=${encodeURIComponent(returnTo)}`,
}));
const manage = vi.hoisted(() => ({
  saveAccountName: vi.fn(),
  readGoogleAccount: vi.fn(),
  connectGoogle: vi.fn(),
  removeGoogle: vi.fn(),
  readAccountSessions: vi.fn(),
  signOutSession: vi.fn(),
  signOutOtherSessions: vi.fn(),
}));
const telemetry = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => telemetry);
vi.mock('@/lib/account-manage', () => ({ ...manage, ACCOUNT_NAME_MAX: 100 }));

const {
  NAME_FAILED,
  NAME_SAVED,
  NOT_FRESH,
  SettingsAccountNameRow,
  SettingsSessionsRow,
  SettingsSignInMethodsRow,
  SettingsSignOutRow,
} = await import('./SettingsAccountManageRows');

const rowOf = <T,>(kind: string) =>
  SETTINGS_CATEGORIES.flatMap((c) => c.rows).find((r) => r.kind === kind) as T;

beforeEach(() => {
  auth.value = {
    isSignedIn: true,
    user: { id: 'acct_x', name: 'Ada', email: 'ada@example.com' },
    refreshSession: vi.fn(async () => {}),
  };
  config.methods = ['google', 'email-code'];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SettingsAccountNameRow', () => {
  const row = () => rowOf<SettingsAccountNameRowSpec>('accountName');

  it('saves a changed name and re-reads the session', async () => {
    manage.saveAccountName.mockResolvedValue(true);
    render(<SettingsAccountNameRow row={row()} />);
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ada Lovelace' } });
    fireEvent.click(save);
    await screen.findByText(NAME_SAVED);
    expect(manage.saveAccountName).toHaveBeenCalledWith('Ada Lovelace');
    expect(auth.value.refreshSession).toHaveBeenCalled();
  });

  it('keeps Save off for a blank name and says when saving failed', async () => {
    manage.saveAccountName.mockResolvedValue(false);
    render(<SettingsAccountNameRow row={row()} />);
    const input = screen.getByLabelText('Your name');
    fireEvent.change(input, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
    fireEvent.change(input, { target: { value: 'Grace' } });
    fireEvent.submit(input.closest('form')!);
    await screen.findByText(NAME_FAILED);
    expect(auth.value.refreshSession).not.toHaveBeenCalled();
  });

  it('clears a refusal once the name is edited, even back to the stored one', async () => {
    manage.saveAccountName.mockResolvedValue(false);
    render(<SettingsAccountNameRow row={row()} />);
    const input = screen.getByLabelText('Your name');
    fireEvent.change(input, { target: { value: 'Grace' } });
    fireEvent.submit(input.closest('form')!);
    await screen.findByText(NAME_FAILED);
    fireEvent.change(input, { target: { value: 'Ada' } });
    expect(screen.queryByText(NAME_FAILED)).toBeNull();
  });
});

describe('SettingsSignInMethodsRow', () => {
  const row = () => rowOf<SettingsSignInMethodsRowSpec>('signInMethods');

  it('shows the email code always, and Google connected with Remove', async () => {
    manage.readGoogleAccount.mockResolvedValue('acc_google');
    manage.removeGoogle.mockResolvedValue('done');
    render(<SettingsSignInMethodsRow row={row()} />);
    expect(screen.getByText(/ada@example.com/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await screen.findByRole('button', { name: 'Connect Google' });
    expect(manage.removeGoogle).toHaveBeenCalledWith('acc_google');
  });

  it('asks for a fresh sign-in when removing is refused for that', async () => {
    manage.readGoogleAccount.mockResolvedValue('acc_google');
    manage.removeGoogle.mockResolvedValue('not_fresh');
    render(<SettingsSignInMethodsRow row={row()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await screen.findByText(NOT_FRESH, { exact: false });
    expect(screen.getByRole('link', { name: 'Sign In Again' }).getAttribute('href')).toBe(
      '/sign-in/?redirect_url=%2Fexplorer%3Fsettings%3Daccount',
    );
  });

  it('connects Google, returning here, and offers a retry when the list fails', async () => {
    manage.readGoogleAccount.mockResolvedValueOnce(null).mockResolvedValueOnce(false);
    manage.connectGoogle.mockResolvedValue('failed');
    render(<SettingsSignInMethodsRow row={row()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try Again' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Google' }));
    await waitFor(() =>
      expect(manage.connectGoogle).toHaveBeenCalledWith('/explorer?settings=account'),
    );
    await screen.findByText("That didn't work. Try again.");
  });

  it('offers no Remove, and no email line, on a host with Google alone', async () => {
    config.methods = ['google'];
    manage.readGoogleAccount.mockResolvedValue('acc_google');
    render(<SettingsSignInMethodsRow row={row()} />);
    await screen.findByText('· Connected');
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByText(/Email code/)).toBeNull();
  });

  it('shows no Google line where the host offers no Google', () => {
    config.methods = ['email-code'];
    render(<SettingsSignInMethodsRow row={row()} />);
    expect(screen.queryByText('Google')).toBeNull();
    expect(manage.readGoogleAccount).not.toHaveBeenCalled();
  });
});

describe('SettingsSessionsRow', () => {
  const row = () => rowOf<SettingsSessionsRowSpec>('sessions');
  const sessions = [
    { token: 't1', label: 'Chrome on Linux', lastActive: new Date('2026-10-25'), current: true },
    { token: 't2', label: 'Safari on iOS', lastActive: new Date('2026-10-20'), current: false },
  ];

  it('lists sessions, marks this one, and signs another out', async () => {
    manage.readAccountSessions.mockResolvedValueOnce(sessions).mockResolvedValueOnce([sessions[0]]);
    manage.signOutSession.mockResolvedValue(true);
    render(<SettingsSessionsRow row={row()} />);
    expect(await screen.findByText('This browser')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out Safari on iOS' }));
    await waitFor(() => expect(screen.queryByText('Safari on iOS')).toBeNull());
    expect(manage.signOutSession).toHaveBeenCalledWith('t2');
    expect(screen.queryByRole('button', { name: 'Sign Out Everywhere Else' })).toBeNull();
  });

  it('signs out everywhere else, and says when that failed', async () => {
    manage.readAccountSessions.mockResolvedValue(sessions);
    manage.signOutOtherSessions.mockResolvedValue(false);
    render(<SettingsSessionsRow row={row()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign Out Everywhere Else' }));
    await screen.findByText("That didn't work. Try again.");
  });

  // A signed-out session leaves the list at once, while the list is read again, and its button is busy meanwhile.
  it('drops a signed-out session at once, without blanking the list, and never signs it out twice', async () => {
    let answer!: (ok: boolean) => void;
    manage.signOutSession.mockReturnValue(new Promise<boolean>((r) => (answer = r)));
    let reread!: (rows: typeof sessions) => void;
    manage.readAccountSessions
      .mockResolvedValueOnce(sessions)
      .mockReturnValueOnce(new Promise((r) => (reread = r)));
    render(<SettingsSessionsRow row={row()} />);
    const button = await screen.findByRole('button', { name: 'Sign out Safari on iOS' });
    fireEvent.click(button);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(manage.signOutSession).toHaveBeenCalledTimes(1);
    answer(true);
    await waitFor(() => expect(screen.queryByText('Safari on iOS')).toBeNull());
    // The list is read again, but this browser stays on screen meanwhile.
    expect(screen.getByText('This browser')).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
    reread([sessions[0]!]);
    await waitFor(() => expect(manage.readAccountSessions).toHaveBeenCalledTimes(2));
  });

  it('drops every other session at once after Sign Out Everywhere Else', async () => {
    manage.readAccountSessions
      .mockResolvedValueOnce(sessions)
      .mockReturnValueOnce(new Promise(() => {}));
    manage.signOutOtherSessions.mockResolvedValue(true);
    render(<SettingsSessionsRow row={row()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign Out Everywhere Else' }));
    await waitFor(() => expect(screen.queryByText('Safari on iOS')).toBeNull());
    expect(screen.getByText('This browser')).toBeTruthy();
  });

  it('offers a retry when the sessions cannot be read', async () => {
    manage.readAccountSessions.mockResolvedValueOnce(null).mockResolvedValueOnce(sessions);
    render(<SettingsSessionsRow row={row()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try Again' }));
    expect(await screen.findByText('Safari on iOS')).toBeTruthy();
  });
});

describe('SettingsSignOutRow', () => {
  const row = () => rowOf<SettingsSignOutRowSpec>('signOut');

  it('is in Signing In, after Where You’re Signed In, for the signed in only', () => {
    const account = SETTINGS_CATEGORIES.find((c) => c.id === 'account')!;
    const keys = account.rows.map((r) => r.key);
    expect(keys.indexOf('signOut')).toBe(keys.indexOf('sessions') + 1);
    expect(row().section).toBe('Signing In');
    expect(rowOf<SettingsSessionsRowSpec>('sessions').label).toBe('Where You’re Signed In');
    expect(row().available?.({ signedIn: false } as never)).toBe(false);
  });

  it('signs this browser out as the account menu does, and counts it', () => {
    const signOut = vi.fn(async () => {});
    auth.value = { ...auth.value, signOut };
    render(<SettingsSignOutRow row={row()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
    expect(telemetry.track).toHaveBeenCalledWith('Session', 'SignedOut');
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/' });
    expect(screen.getByRole('button', { name: 'Signing Out…' })).toHaveProperty('disabled', true);
  });
});
