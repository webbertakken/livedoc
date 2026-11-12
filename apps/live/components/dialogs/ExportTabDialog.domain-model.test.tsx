// @vitest-environment jsdom

// The Domain Model card (docs/specs/021-event-storming/domain-export.md "The zip"): offered on an Event Storming
// board only, and only where the export can reach the api for the board.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';
import { ExportTabDialog } from './ExportTabDialog';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/hooks/persistence/useCapabilities', () => ({
  useCapabilities: () => ({ aiEnabled: false, emailEnabled: false }),
}));

const board = { id: 'es', name: 'Orders', kind: 'event-storming', elements: [] } as unknown as Tab;
const plain = { id: 'p', name: 'Plain', elements: [] } as unknown as Tab;
const context = { ownerId: 'me', documentId: 'd', shareCode: null };

const open = (tab: Tab, imageContext?: typeof context) =>
  render(
    <ExportTabDialog
      tab={tab}
      documentName="Doc"
      onClose={vi.fn()}
      {...(imageContext ? { imageContext } : {})}
    />,
  );

afterEach(cleanup);

describe('ExportTabDialog Domain Model', () => {
  it('is offered on an Event Storming board, and opens its panel', () => {
    open(board, context);
    fireEvent.click(screen.getByRole('button', { name: /Domain Model/ }));
    expect(screen.getByRole('combobox', { name: 'Types in' })).toBeTruthy();
    expect(screen.getByText('Turn this board into a spec of the domain and its types.')).toBeTruthy();
  });

  it('is not offered on any other tab, nor without a document to export from', () => {
    open(plain, context);
    expect(screen.queryByRole('button', { name: /Domain Model/ })).toBeNull();
    cleanup();
    open(board);
    expect(screen.queryByRole('button', { name: /Domain Model/ })).toBeNull();
  });
});
