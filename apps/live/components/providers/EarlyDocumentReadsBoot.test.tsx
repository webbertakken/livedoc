// @vitest-environment jsdom
// docs/specs/016-platform/web-performance.md "The open path asks in parallel": the open path's reads start from
// what every route ships, at a document's address only, once the session has settled the way the editor waits.
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, bootstrap, reads, pool } = vi.hoisted(() => ({
  auth: { authLoaded: false },
  bootstrap: { authLoaded: false, accountId: null as string | null },
  reads: { askEarlyDocumentReads: vi.fn(async () => {}) },
  pool: { openEarlyReads: vi.fn() },
}));
vi.mock('./deferred-auth', () => ({ useDeferredAuth: () => auth }));
vi.mock('@/hooks/persistence/useAccountApiBootstrap', () => ({
  useAccountApiBootstrap: () => bootstrap,
}));
vi.mock('@/lib/open-path/early-document-reads', () => reads);
vi.mock('@/lib/api/early-reads', () => pool);

import {
  EarlyDocumentReadsBoot,
  resetEarlyDocumentReadsBootForTests,
} from './EarlyDocumentReadsBoot';

const settle = (accountId: string | null = null) => {
  auth.authLoaded = true;
  bootstrap.authLoaded = true;
  bootstrap.accountId = accountId;
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetEarlyDocumentReadsBootForTests();
  auth.authLoaded = false;
  bootstrap.authLoaded = false;
  bootstrap.accountId = null;
  reads.askEarlyDocumentReads.mockClear();
  pool.openEarlyReads.mockClear();
});
afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('EarlyDocumentReadsBoot', () => {
  it('opens the pool as a document’s page starts, and asks once the session has settled', async () => {
    window.history.replaceState({}, '', '/document/shared?s=c1');
    const { rerender } = render(<EarlyDocumentReadsBoot />);
    expect(pool.openEarlyReads).toHaveBeenCalledTimes(1);
    await flush();
    expect(reads.askEarlyDocumentReads).not.toHaveBeenCalled();

    settle('acct_1');
    rerender(<EarlyDocumentReadsBoot />);
    await flush();

    expect(reads.askEarlyDocumentReads).toHaveBeenCalledWith({
      accountId: 'acct_1',
      href: `${window.location.origin}/document/shared?s=c1`,
    });
  });

  it('asks once per page load, however often it renders', async () => {
    window.history.replaceState({}, '', '/document/d1');
    settle();
    const { rerender } = render(<EarlyDocumentReadsBoot />);
    await flush();
    rerender(<EarlyDocumentReadsBoot />);
    await flush();
    expect(reads.askEarlyDocumentReads).toHaveBeenCalledTimes(1);
    expect(reads.askEarlyDocumentReads).toHaveBeenCalledWith({
      accountId: null,
      href: `${window.location.origin}/document/d1`,
    });
  });

  it('never asks on the five-second guest fallback: only a session that answered settles it', async () => {
    window.history.replaceState({}, '', '/document/d1');
    bootstrap.authLoaded = true;
    render(<EarlyDocumentReadsBoot />);
    await flush();
    expect(reads.askEarlyDocumentReads).not.toHaveBeenCalled();
  });

  it('waits for a guest migration, which holds the editor too', async () => {
    window.history.replaceState({}, '', '/document/d1');
    auth.authLoaded = true;
    render(<EarlyDocumentReadsBoot />);
    await flush();
    expect(reads.askEarlyDocumentReads).not.toHaveBeenCalled();
  });

  it('does nothing at any other address', async () => {
    for (const path of ['/explorer', '/new?template=kanban', '/embed?s=c1', '/embed/workbench']) {
      resetEarlyDocumentReadsBootForTests();
      window.history.replaceState({}, '', path);
      settle();
      render(<EarlyDocumentReadsBoot />);
      await flush();
      cleanup();
    }
    expect(pool.openEarlyReads).not.toHaveBeenCalled();
    expect(reads.askEarlyDocumentReads).not.toHaveBeenCalled();
  });

  it('asks nothing when the reader has left the document before the session settled', async () => {
    window.history.replaceState({}, '', '/document/d1');
    const { rerender } = render(<EarlyDocumentReadsBoot />);
    window.history.replaceState({}, '', '/explorer');
    settle();
    rerender(<EarlyDocumentReadsBoot />);
    await flush();
    expect(reads.askEarlyDocumentReads).not.toHaveBeenCalled();
  });

  it('renders nothing', () => {
    const { container } = render(<EarlyDocumentReadsBoot />);
    expect(container.innerHTML).toBe('');
  });
});
