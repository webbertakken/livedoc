// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { EllipsisMenuButton } from './EllipsisMenuButton';

vi.mock('@/lib/clamp-to-viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/clamp-to-viewport')>()),
  clampToViewport: () => ({ x: 0, y: 0 }),
}));

// The active tab's ⋯ (docs/specs/007-editor/live-app.md "Tab menu"): it toggles the tab menu, anchored to itself, and
// hands it what Delete does (docs/specs/006-document/document-structure.md "Deleting a tab").

type Props = ComponentProps<typeof EllipsisMenuButton>;

function props(over: Partial<Props> = {}): Props {
  const noop = () => {};
  return {
    open: false,
    onToggle: noop,
    onClose: noop,
    deletion: { kind: 'tab' },
    canClearContent: true,
    locked: false,
    selfId: 'me',
    otherDocuments: [],
    folderNames: [],
    currentFolder: null,
    onMoveToFolder: noop,
    onRemoveFromFolder: noop,
    onRename: noop,
    onDuplicate: noop,
    onClearContent: noop,
    onImport: noop,
    onExport: noop,
    onCopyTo: noop,
    onToggleLock: noop,
    onDelete: noop,
    ...over,
  };
}

afterEach(cleanup);

describe('EllipsisMenuButton', () => {
  it('shows only its button while closed, and the menu once open', () => {
    const { rerender } = render(<EllipsisMenuButton {...props()} />);
    expect(screen.getByRole('button', { name: 'Tab menu' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    rerender(<EllipsisMenuButton {...props({ open: true })} />);
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveProperty('disabled', false);
  });

  it('opens the menu with what Delete does, and a Board or Sheet tab its own Import', () => {
    render(
      <EllipsisMenuButton
        {...props({
          open: true,
          deletion: {
            kind: 'blocked',
            reason: 'This is the only tab, and you cannot delete the document.',
          },
          dataRows: { importLabel: 'Import CSV…' },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Import CSV…')).toBeTruthy();
  });
});
