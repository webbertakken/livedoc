// @vitest-environment jsdom

// The profile card that opens Settings > Account (docs/specs/014-identity/profile-and-email-notifications.md
// "Identity").

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_CATEGORIES, type SettingsIdentityRowSpec } from './settings-catalogue';

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/components/providers/deferred-auth', () => ({ useDeferredAuth: () => auth.value }));
vi.mock('@/lib/auth-config', () => ({ useSignInAvailable: () => true }));
vi.mock('@/components/chrome/auth-shared', () => ({
  useAuthHrefs: () => ({
    signInHref: '/sign-in/?redirect_url=%2Fexplorer%3Fsettings%3Daccount',
    signUpHref: '/get-started/?redirect_url=%2Fexplorer%3Fsettings%3Daccount',
  }),
}));
const self = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/lib/api/self', () => ({ apiLoadSelf: self.load }));
const guest = vi.hoisted(() => ({ id: 'guest_1' as string | null }));
vi.mock('@/lib/local-identity', () => ({ getGuestSelfId: () => guest.id }));

const { SettingsProfileCard, GUEST_INVITATION_HEADING, GUEST_INVITATION_LINES } =
  await import('./SettingsProfileCard');
const { announceSelfColour } = await import('@/lib/self-presence');

const row = SETTINGS_CATEGORIES.flatMap((c) => c.rows).find(
  (r) => r.kind === 'identity',
) as SettingsIdentityRowSpec;
const chips = () => within(screen.getByRole('list', { name: 'About this account' }));

beforeEach(() => {
  guest.id = 'guest_1';
  self.load.mockReset();
});
afterEach(cleanup);

describe('SettingsProfileCard, signed in', () => {
  beforeEach(() => {
    auth.value = {
      authLoaded: true,
      isSignedIn: true,
      accountId: 'acct_1',
      user: {
        id: 'acct_1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        createdAt: new Date('2026-03-14T12:00:00Z'),
        pictureUrl: null,
      },
    };
    self.load.mockResolvedValue({
      id: 'acct_1',
      name: 'Ada Lovelace',
      color: '#ef4444',
      status: 'online',
    });
  });

  it('names the account, its email, its kind, when it joined and its colour', async () => {
    render(<SettingsProfileCard row={row} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Ada Lovelace' })).toBeTruthy();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(chips().getByText('LiveDoc Account')).toBeTruthy();
    expect(chips().getByText(/^Joined /)).toBeTruthy();
    await waitFor(() => expect(chips().getByText('Colour: Red')).toBeTruthy());
    expect(self.load).toHaveBeenCalledWith('acct_1');
    expect(screen.queryByText(GUEST_INVITATION_HEADING)).toBeNull();
  });

  it('draws their cursor and name tag in their colour, as collaborators see it', async () => {
    const { container } = render(<SettingsProfileCard row={row} />);
    const banner = container.querySelector('[data-profile-banner]') as HTMLElement;
    expect(banner.getAttribute('aria-hidden')).toBe('true');
    await waitFor(() => expect(banner.style.getPropertyValue('--identity')).toBe('#ef4444'));
    expect(banner.textContent).toContain('Ada Lovelace');
  });

  it('takes a colour picked in Settings at once', async () => {
    render(<SettingsProfileCard row={row} />);
    await waitFor(() => expect(chips().getByText('Colour: Red')).toBeTruthy());
    act(() => announceSelfColour('acct_1', '#0ea5e9'));
    expect(chips().getByText('Colour: Sky')).toBeTruthy();
  });

  it('holds the colour chip in place, neutral, until the record answers', () => {
    self.load.mockReturnValue(new Promise(() => {}));
    render(<SettingsProfileCard row={row} />);
    expect(chips().getByText('Colour: …')).toBeTruthy();
  });
});

describe('SettingsProfileCard, as a guest', () => {
  beforeEach(() => {
    auth.value = { authLoaded: true, isSignedIn: false, accountId: null, user: null };
    self.load.mockResolvedValue({
      id: 'guest_1',
      name: 'Brave Heron',
      color: '#10b981',
      status: 'online',
    });
  });

  it('is the guest card: their guest name, not signed in, this browser only', async () => {
    render(<SettingsProfileCard row={row} />);
    expect(await screen.findByRole('heading', { level: 3, name: 'Brave Heron' })).toBeTruthy();
    expect(screen.getByText('Not signed in')).toBeTruthy();
    expect(chips().getByText('Guest · This Browser Only')).toBeTruthy();
    expect(chips().getByText('Colour: Emerald')).toBeTruthy();
    expect(self.load).toHaveBeenCalledWith('guest_1');
  });

  it('says what signing in brings, and offers Sign In and Create Account', () => {
    render(<SettingsProfileCard row={row} />);
    expect(screen.getByText(GUEST_INVITATION_HEADING)).toBeTruthy();
    for (const line of GUEST_INVITATION_LINES) expect(screen.getByText(line)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign In' }).getAttribute('href')).toMatch(
      /^\/sign-in\//,
    );
    expect(screen.getByRole('link', { name: 'Create Account' }).getAttribute('href')).toMatch(
      /^\/get-started\//,
    );
  });

  it('is "Guest" with no record, and never mints a guest id to read one', async () => {
    guest.id = null;
    render(<SettingsProfileCard row={row} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Guest' })).toBeTruthy();
    // No record yet: a colour is given on the first open, so it is Automatic until then.
    await waitFor(() => expect(chips().getByText('Colour: Automatic')).toBeTruthy());
    expect(self.load).not.toHaveBeenCalled();
  });
});
