// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';
import { askActionSpies } from '@/hooks/canvas/lane-actions.fixture';
import { ASK_UNREACHABLE } from '@/lib/ask';
import { askViewFor, openAsk, resetAskViewForTests, type AskAnchor } from '@/lib/ask-view';
import { note, orderFlow } from '@/lib/change-board.fixture';
import { AskPopover, type AskPopoverProps } from './AskPopover';

// The Ask popover (docs/specs/021-event-storming/asks.md "Where an ask starts"): what it offers for each scope and
// hand, and that each control reaches its act.

const focus = vi.fn();
const anchor: AskAnchor = {
  getBoundingClientRect: () => new DOMRect(900, 60, 80, 36),
  focus,
  contains: () => false,
};
const tab = (over: Partial<Tab> = {}): Tab => ({
  id: 't',
  name: 'Orders',
  kind: 'event-storming',
  elements: orderFlow(),
  ...over,
});

function show(over: Partial<AskPopoverProps> = {}) {
  const acts = {
    ...askActionSpies(),
    copyPrompt: vi.fn(async (_prompt: string, _hand: string) => true),
    arrange: vi.fn(),
  };
  const view = render(
    <AskPopover
      tab={tab()}
      scope={{ type: 'board' }}
      anchor={anchor}
      asking={false}
      failure={null}
      aiEnabled
      thisBrowser={false}
      board={{
        document: 'Shop',
        documentId: 'doc-1',
        link: 'https://docs.test/document/doc-1#t=t',
      }}
      acts={acts}
      {...over}
    />,
  );
  return { acts, ...view };
}
const dialog = () => screen.getByRole('dialog', { name: 'Ask for Suggestions' });
const pick = (name: string) => fireEvent.click(screen.getByRole('radio', { name }));

beforeEach(() => {
  resetAskViewForTests();
  openAsk('t', { type: 'board' });
  focus.mockClear();
  localStorage.clear();
});
afterEach(cleanup);

describe('AskPopover', () => {
  it('offers the board its topics, the first chosen, and the three hands with the CLI recommended', () => {
    show();
    const radios = within(dialog()).getAllByRole('radio');
    expect(radios.map((r) => r.closest('label')?.textContent)).toEqual([
      'Fill the Gaps',
      'Group into Contexts',
      'Sharpen the Wording',
      'Reorganise into Lanes',
      'CLIRecommended',
      'MCPAI tool',
      'Built-inSmall model',
    ]);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Fill the Gaps' }).checked).toBe(
      true,
    );
    expect(screen.getByRole<HTMLInputElement>('radio', { name: /CLI/ }).checked).toBe(true);
    expect(dialog().textContent).toContain('About the board');
  });

  it('copies the prompt of the chosen topic and hand, and says what to do with it', async () => {
    const { acts } = show();
    pick('Sharpen the Wording');
    fireEvent.click(screen.getByRole('radio', { name: /MCP/ }));
    expect(screen.getByLabelText('Prompt').textContent).toContain(
      'Sharpen the wording of the notes on this board.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy Prompt' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).not.toBeNull();
    expect(acts.copyPrompt.mock.calls[0]![0]).toContain('read_event_storming');
    expect(acts.copyPrompt.mock.calls[0]![1]).toBe('mcp');
    expect(dialog().textContent).toContain(
      'Paste it into your agent. Its suggestions appear here as it works.',
    );
  });

  it('says so when the prompt could not be copied', async () => {
    const { acts } = show();
    acts.copyPrompt.mockResolvedValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Prompt' }));
    expect(await screen.findByText(/Could not copy/)).not.toBeNull();
  });

  it('steps the lane count for a lane plan, and offers the board’s own fold', () => {
    const three = tab({
      elements: [note('a', 'A', 0, 'actor', 0), note('b', 'B', 0, 'command', 1), note('c', 'C', 1)],
    });
    const { acts } = show({ tab: three });
    expect(screen.queryByRole('group', { name: 'Lanes' })).toBeNull();
    pick('Reorganise into Lanes');
    const lanes = screen.getByRole('group', { name: 'Lanes' });
    expect(within(lanes).getByRole('status').textContent).toContain('3');
    fireEvent.click(screen.getByRole('button', { name: 'Fewer lanes' }));
    expect(within(lanes).getByRole('status').textContent).toContain('2');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Fewer lanes' }).disabled).toBe(
      true,
    );
    expect(screen.getByLabelText('Prompt').textContent).toContain(
      'Reorganise this board into 2 lanes.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fold the Lanes' }));
    expect(acts.foldBoard).toHaveBeenCalledWith(2);
  });

  it('asks the built-in model about the scope, shows it working and lets it be cancelled', () => {
    const scope = { type: 'notes' as const, ids: ['place'] };
    const { acts, rerender } = show({ scope });
    fireEvent.click(screen.getByRole('radio', { name: /Built-in/ }));
    expect(screen.queryByLabelText('Prompt')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(acts.ask).toHaveBeenCalledWith({ topic: 'gaps', scope, lanes: undefined });
    rerender(
      <AskPopover
        tab={tab()}
        scope={scope}
        anchor={anchor}
        asking
        failure={null}
        aiEnabled
        thisBrowser={false}
        board={{ document: 'Shop', documentId: 'doc-1', link: 'l' }}
        acts={acts}
      />,
    );
    expect(dialog().textContent).toContain('Asking the model…');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(acts.cancelAsk).toHaveBeenCalled();
  });

  it('says why an ask failed', () => {
    localStorage.setItem('livedoc:v2:es-ask-hand', 'built-in');
    show({ failure: 'The model did not answer. Copy the prompt for your agent instead.' });
    expect(screen.getByRole('alert').textContent).toContain('The model did not answer.');
  });

  it('offers two hands on a deployment with no model, and no prompt for a board in This Browser', () => {
    show({ aiEnabled: false, thisBrowser: true });
    expect(screen.queryByRole('radio', { name: /Built-in/ })).toBeNull();
    expect(dialog().textContent).toContain(ASK_UNREACHABLE);
    expect(screen.queryByRole('button', { name: 'Copy Prompt' })).toBeNull();
  });

  it('offers Arrange and Reorder with nothing selected, closing as it starts', () => {
    const { acts } = show();
    fireEvent.click(screen.getByRole('button', { name: /Arrange and Reorder/ }));
    expect(acts.arrange).toHaveBeenCalled();
    expect(askViewFor('t').open).toBe(false);
    cleanup();
    show({ scope: { type: 'context', id: 'ordering' } });
    expect(screen.queryByRole('button', { name: /Arrange and Reorder/ })).toBeNull();
    expect(dialog().textContent).toContain('About “Ordering”');
  });

  it('keeps the About when the field is left, and when the popover closes', () => {
    const { acts, unmount } = show({ tab: tab({ esAbout: 'A shop.' }) });
    const field = screen.getByLabelText('About This Domain');
    expect((field as HTMLTextAreaElement).value).toBe('A shop.');
    fireEvent.change(field, { target: { value: 'A shop that ships books.' } });
    fireEvent.blur(field);
    expect(acts.saveAbout).toHaveBeenLastCalledWith('A shop that ships books.');
    fireEvent.change(field, { target: { value: 'A bookshop.' } });
    unmount();
    expect(acts.saveAbout).toHaveBeenLastCalledWith('A bookshop.');
  });

  it('counts the About near its limit', () => {
    show({ tab: tab({ esAbout: 'x'.repeat(1900) }) });
    expect(dialog().textContent).toContain('1,900 / 2,000');
  });

  it('counts what was declined and forgets it; says nothing at none', () => {
    const esDeclined = [{ type: 'note' as const, words: 'Order lost', about: ['placed'] }];
    const { acts } = show({ tab: tab({ esDeclined }) });
    expect(dialog().textContent).toContain('1 declined');
    fireEvent.click(screen.getByRole('button', { name: 'Forget Declined' }));
    expect(acts.forgetDeclined).toHaveBeenCalled();
    cleanup();
    show();
    expect(screen.queryByRole('button', { name: 'Forget Declined' })).toBeNull();
  });

  it('closes on Escape and hands the focus back to what it hangs from', () => {
    show();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(askViewFor('t').open).toBe(false);
    expect(focus).toHaveBeenCalled();
  });
});
