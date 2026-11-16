// @vitest-environment jsdom
// docs/specs/016-platform/web-performance.md "The open path asks in parallel": the open path's reads start from
// what every route ships, at a document's address only, once the session has settled, heard outside React.
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { reads, pool, migration, asked } = vi.hoisted(() => ({
  reads: { askEarlyDocumentReads: vi.fn(async () => {}) },
  pool: { openEarlyReads: vi.fn() },
  migration: { guestMigrationPending: vi.fn((_id: string) => false) },
  asked: { token: null as string | null },
}));
vi.mock('@/lib/open-path/early-document-reads', () => reads);
vi.mock('@/lib/api/early-reads', () => pool);
vi.mock('@/lib/guest-migration', () => migration);

import { apiHeaders, setTokenProvider } from '@/lib/api/core';
import { publishFirstSession, resetFirstSessionForTests } from '@/lib/first-session';
import {
  EarlyDocumentReadsBoot,
  resetEarlyDocumentReadsBootForTests,
} from './EarlyDocumentReadsBoot';

const getToken = vi.fn(async () => 'jwt-1');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetEarlyDocumentReadsBootForTests();
  resetFirstSessionForTests();
  setTokenProvider(null);
  reads.askEarlyDocumentReads.mockReset();
  reads.askEarlyDocumentReads.mockImplementation(async () => {
    // What the early reads' requests would carry while they ask.
    asked.token =
      ((await apiHeaders('acct_1').catch(() => ({}))) as Record<string, string>).Authorization ??
      null;
  });
  pool.openEarlyReads.mockClear();
  migration.guestMigrationPending.mockReturnValue(false);
  asked.token = null;
});
afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('EarlyDocumentReadsBoot', () => {
  it('opens the pool as a document’s page starts, and asks once the session has settled', async () => {
    window.history.replaceState({}, '', '/document/shared?s=c1');
    render(<EarlyDocumentReadsBoot />);
    expect(pool.openEarlyReads).toHaveBeenCalledTimes(1);
    await flush();
    expect(reads.askEarlyDocumentReads).not.toHaveBeenCalled();

    publishFirstSession({ accountId: null, getToken });
    await flush();

    expect(reads.askEarlyDocumentReads).toHaveBeenCalledWith({
      accountId: null,
      href: `${window.location.origin}/document/shared?s=c1`,
    });
  });

  it('lends a signed-in reader’s token while the early reads ask, and only then', async () => {
    window.history.replaceState({}, '', '/document/d1');
    publishFirstSession({ accountId: 'acct_1', getToken });
    render(<EarlyDocumentReadsBoot />);
    await flush();
    await flush();

    expect(reads.askEarlyDocumentReads).toHaveBeenCalledWith({
      accountId: 'acct_1',
      href: `${window.location.origin}/document/d1`,
    });
    expect(asked.token).toBe('Bearer jwt-1');
    await expect(apiHeaders('acct_1')).rejects.toThrow();
  });

  it('asks once per page load, however often it mounts', async () => {
    window.history.replaceState({}, '', '/document/d1');
    publishFirstSession({ accountId: null, getToken });
    render(<EarlyDocumentReadsBoot />);
    cleanup();
    render(<EarlyDocumentReadsBoot />);
    await flush();
    expect(pool.openEarlyReads).toHaveBeenCalledTimes(1);
    expect(reads.askEarlyDocumentReads).toHaveBeenCalledTimes(1);
  });

  it('leaves a sign-in with a guest migration to run to the editor', async () => {
    window.history.replaceState({}, '', '/document/d1');
    migration.guestMigrationPending.mockReturnValue(true);
    publishFirstSession({ accountId: 'acct_1', getToken });
    render(<EarlyDocumentReadsBoot />);
    await flush();
    expect(reads.askEarlyDocumentReads).not.toHaveBeenCalled();
  });

  it('does nothing at any other address', async () => {
    publishFirstSession({ accountId: null, getToken });
    for (const path of ['/explorer', '/new?template=kanban', '/embed?s=c1', '/embed/workbench']) {
      resetEarlyDocumentReadsBootForTests();
      window.history.replaceState({}, '', path);
      render(<EarlyDocumentReadsBoot />);
      await flush();
      cleanup();
    }
    expect(pool.openEarlyReads).not.toHaveBeenCalled();
    expect(reads.askEarlyDocumentReads).not.toHaveBeenCalled();
  });

  it('asks nothing when the reader has left the document before the session settled', async () => {
    window.history.replaceState({}, '', '/document/d1');
    render(<EarlyDocumentReadsBoot />);
    window.history.replaceState({}, '', '/explorer');
    publishFirstSession({ accountId: null, getToken });
    await flush();
    expect(reads.askEarlyDocumentReads).not.toHaveBeenCalled();
  });

  it('renders nothing', () => {
    const { container } = render(<EarlyDocumentReadsBoot />);
    expect(container.innerHTML).toBe('');
  });
});
