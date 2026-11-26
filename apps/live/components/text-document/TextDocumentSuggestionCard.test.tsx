// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SuggestionCard } from '@/lib/text-document/text-document-suggestion-cards';
import { TextDocumentSuggestionCard } from './TextDocumentSuggestionCard';

// docs/specs/034-text-documents/review.md "Suggestion cards": the author, what it does, Accept and Reject as offered.
const CARD: SuggestionCard = {
  id: 's1',
  from: 1,
  to: 6,
  at: Date.UTC(2026, 10, 26, 9, 30),
  author: { key: 'k-ada', name: 'Ada Lovelace', colour: '#0284c7' },
  lines: ['Add: “quick”'],
};

function draw(over: Partial<Parameters<typeof TextDocumentSuggestionCard>[0]> = {}) {
  const props = {
    card: CARD,
    selected: false,
    offers: { accept: true, reject: true },
    onSelect: vi.fn(),
    onAccept: vi.fn(),
    onReject: vi.fn(),
    onStep: vi.fn(),
    onExit: vi.fn(),
    ...over,
  };
  render(<TextDocumentSuggestionCard {...props} />);
  return props;
}

describe('TextDocumentSuggestionCard', () => {
  it('names its author and what it does, and settles it as offered', () => {
    const props = draw();
    const card = screen.getByRole('group', { name: 'Suggestion by Ada Lovelace: Add: “quick”' });
    expect(card.textContent).toContain('Ada Lovelace');
    expect(card.textContent).toContain('AL');
    fireEvent.click(screen.getByRole('button', { name: 'Accept suggestion' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject suggestion' }));
    expect(props.onAccept).toHaveBeenCalledOnce();
    expect(props.onReject).toHaveBeenCalledOnce();
    // The buttons never select the card.
    expect(props.onSelect).not.toHaveBeenCalled();
    fireEvent.click(card);
    expect(props.onSelect).toHaveBeenCalledOnce();
  });

  it('draws only what is offered', () => {
    draw({ offers: { accept: false, reject: true } });
    expect(screen.queryByRole('button', { name: 'Accept suggestion' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reject suggestion' })).toBeTruthy();
  });

  it('draws no buttons for one who may not settle it', () => {
    draw({ offers: { accept: false, reject: false } });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says From the file under a file’s author, with no time where it had none', () => {
    draw({
      card: { ...CARD, at: 0, author: { name: 'Word', colour: '#64748b', fromFile: true } },
    });
    expect(screen.getByText('From the file')).toBeTruthy();
    expect(document.querySelector('time')).toBeNull();
  });

  it('steps with J and K and lets go with U and Escape, on the card itself', () => {
    const onStep = vi.fn();
    const props = draw({ selected: true, onStep });
    const card = screen.getByRole('group');
    fireEvent.keyDown(card, { key: 'j' });
    fireEvent.keyDown(card, { key: 'k' });
    fireEvent.keyDown(card, { key: 'u' });
    fireEvent.keyDown(card, { key: 'Escape' });
    fireEvent.keyDown(card, { key: 'j', ctrlKey: true });
    expect(onStep.mock.calls).toEqual([[true], [false]]);
    expect(props.onExit).toHaveBeenCalledTimes(2);
    expect(card.getAttribute('aria-current')).toBe('true');
  });
});

// review.md "Suggestion cards", Replies: the tied thread's replies under the lines; Reply while selected.
describe('TextDocumentSuggestionCard replies', () => {
  const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7', mayDeleteAny: false };
  const thread = {
    id: 'th',
    tab: 't.0',
    start: new Uint8Array([1]),
    end: new Uint8Array([1]),
    quote: 'Add: “quick”',
    resolved: false,
    suggestion: 's1',
    comments: [
      {
        id: 'r1',
        text: 'Why quick?',
        at: 5,
        author: { key: 'k-ben', name: 'Ben', colour: '#16a34a' },
      },
    ],
  };
  const replies = (over: object = {}) => ({
    thread,
    commenter: ADA,
    onReply: vi.fn(),
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onReact: vi.fn(),
    names: new Map<string, string>(),
    ...over,
  });

  it('draws the replies, and Reply only while selected for whoever may comment', () => {
    const { rerender } = render(
      <TextDocumentSuggestionCard
        card={CARD}
        selected={false}
        offers={{ accept: true, reject: true }}
        onSelect={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onStep={vi.fn()}
        onExit={vi.fn()}
        replies={replies()}
      />,
    );
    expect(screen.getByText('Why quick?')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    const props = {
      card: CARD,
      selected: true,
      offers: { accept: true, reject: true },
      onSelect: vi.fn(),
      onAccept: vi.fn(),
      onReject: vi.fn(),
      onStep: vi.fn(),
      onExit: vi.fn(),
    };
    rerender(<TextDocumentSuggestionCard {...props} replies={replies()} />);
    expect(screen.getByRole('textbox')).toBeTruthy();
    rerender(<TextDocumentSuggestionCard {...props} replies={replies({ commenter: null })} />);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('focuses Reply with R on a selected card', () => {
    render(
      <TextDocumentSuggestionCard
        card={CARD}
        selected
        offers={{ accept: false, reject: false }}
        onSelect={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onStep={vi.fn()}
        onExit={vi.fn()}
        replies={replies({ thread: null })}
      />,
    );
    fireEvent.keyDown(screen.getByRole('group'), { key: 'r' });
    expect(document.activeElement).toBe(screen.getByRole('textbox'));
  });
});
