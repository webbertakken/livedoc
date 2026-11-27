// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NOTIFICATION_SETTINGS_ITEM,
  useTextDocumentNotifications,
} from './useTextDocumentNotifications';

// docs/specs/034-text-documents/review.md "Notifications" (The setting): offered only where it can apply; counted
// before it is kept, never who or which document.

const track = vi.fn<(...a: unknown[]) => void>();
vi.mock('@/lib/telemetry', () => ({ track: (...a: unknown[]) => track(...a) }));
const read = vi.fn(async () => ({ comments: 'for-you', edits: 'none' }));
const write = vi.fn(async (_place: unknown, setting: unknown) => setting);
vi.mock('@/lib/api/notification-settings', () => ({
  apiReadNoticeSetting: () => read(),
  apiWriteNoticeSetting: (place: unknown, setting: unknown) => write(place, setting),
}));

afterEach(() => vi.clearAllMocks());

const place = { ownerId: 'me', documentId: 'D', shareCode: null };

describe('Tools > Notification settings', () => {
  it('is not bound where it cannot apply, so the item is absent', () => {
    const { result } = renderHook(() =>
      useTextDocumentNotifications({ place, offered: false, onClosed: () => {} }),
    );
    expect(result.current.actions[NOTIFICATION_SETTINGS_ITEM]).toBeUndefined();
  });

  it('opens the dialog, counts the choice before keeping it, and closes', async () => {
    const onClosed = vi.fn();
    function Host() {
      const { actions, dialog } = useTextDocumentNotifications({ place, offered: true, onClosed });
      return (
        <>
          <button type="button" onClick={() => actions[NOTIFICATION_SETTINGS_ITEM]!.run()}>
            open
          </button>
          {dialog}
        </>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: /^open$/ }));
    await act(async () => {});
    fireEvent.click(screen.getByRole('radio', { name: /^All comments$/ }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^OK$/ })));
    expect(track).toHaveBeenCalledWith('Document', 'Changed', 'TextDocumentNoticesAllNone');
    expect(write).toHaveBeenCalledWith(place, { comments: 'all', edits: 'none' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onClosed).toHaveBeenCalled();
  });
});
