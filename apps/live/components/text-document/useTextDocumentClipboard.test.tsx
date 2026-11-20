// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Clipboard": the Copying and pasting dialog when the browser
// keeps the clipboard from the Edit menu, naming the keys that still reach it; the note that a paste left content
// kept from another file out, gone after a while.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';
import {
  leftOutNotice,
  PASTE_NOTICE_MS,
  useTextDocumentClipboard,
} from './useTextDocumentClipboard';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

function Harness({
  view,
  onLeftOut = () => {},
}: {
  view: EditorView | null;
  onLeftOut?: (tell: (count: number) => void) => void;
}) {
  const clipboard = useTextDocumentClipboard(view, true);
  useEffect(() => onLeftOut(clipboard.onLeftOut), [onLeftOut, clipboard.onLeftOut]);
  return (
    <div>
      <button type="button" onClick={() => clipboard.actions.paste!.run()}>
        Paste
      </button>
      {clipboard.notice}
      {clipboard.dialog}
    </div>
  );
}

afterEach(() => vi.useRealTimers());

describe('useTextDocumentClipboard', () => {
  it('says to use the keys when the browser refuses the menu, and gives the writing focus back', () => {
    const view = new EditorView(document.body.appendChild(document.createElement('div')), {
      state: EditorState.create({ schema }),
    });
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<Harness view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
    const dialog = screen.getByRole('dialog', { name: 'Copying and pasting' });
    expect(dialog.textContent).toContain('Ctrl+V');
    expect(dialog.textContent).toContain('for paste without formatting');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(view.hasFocus() || document.activeElement === view.dom).toBe(true);
    view.destroy();
  });

  it('notes kept content left out of a paste, for a while', () => {
    vi.useFakeTimers();
    let tell: (count: number) => void = () => {};
    render(
      <Harness
        view={null}
        onLeftOut={(t) => {
          tell = t;
        }}
      />,
    );
    act(() => tell(3));
    expect(screen.getByRole('status').textContent).toBe(leftOutNotice(3));
    expect(leftOutNotice(1)).toBe('Content kept from the other file was left out (1 item).');
    act(() => {
      vi.advanceTimersByTime(PASTE_NOTICE_MS);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
