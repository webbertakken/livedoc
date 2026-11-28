// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { questionsOf, type FormDefinition } from '@livedoc/forms';
import type { ItemTypeDef } from '@livedoc/items';
import type { FormActions } from '@/hooks/forms/useFormActions';
import { FormBuilderContext, type FormBuilderValue } from './form-builder-context';
import { FormBuilderColumn } from './FormBuilderColumn';

// Motion off: a deleted question goes at once rather than after its leave (question-motion.ts).
vi.mock('@/lib/motion-preference', () => ({ prefersReducedMotion: () => true }));

// The builder (docs/specs/030-forms/forms.md "Building a form", "Who may do what"): an Editor edits in place; anyone
// else sees the form as respondents do, with no editing chrome at all.

afterEach(cleanup);

const START: FormDefinition = {
  v: 1,
  heading: 'Bug Report',
  sections: [
    {
      id: 's-1',
      title: '',
      questions: [
        { id: 'q-1', type: 'short', prompt: 'Summary', required: true, goesTo: { to: 'title' } },
        { id: 'q-2', type: 'single', prompt: 'Severity', options: ['Low', 'High'] },
      ],
    },
  ],
};

const BUG: ItemTypeDef = {
  id: 'bug',
  label: 'Bug',
  newTitle: 'New bug',
  glyph: 'bug',
  color: '#dc2626',
  fields: ['title', 'status'],
};

let latest: FormDefinition = START;

function Harness({ canEdit }: { canEdit: boolean }) {
  const [form, setForm] = useState(START);
  const [selectedId, setSelected] = useState<string | null>(null);
  const [focusId, setFocus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    latest = form;
  });
  const actions: FormActions = {
    startForm: vi.fn(),
    newFormFor: vi.fn(),
    changeFormQuietly: vi.fn(),
    setDestinationType: vi.fn(),
    setResponsesTo: vi.fn(),
    changeForm: (fn) => setForm((f) => fn(f)),
    renameForm: (name) => setForm((f) => ({ ...f, heading: name })),
    addFieldFor: vi.fn(() => null),
    syncFieldOptions: vi.fn(),
    newResponsesBoard: vi.fn(),
    newCardType: vi.fn(),
  };
  const value: FormBuilderValue = {
    form,
    canEdit,
    actions,
    selectedId,
    select: (id, focus) => {
      setSelected(id);
      if (focus) setFocus(id);
    },
    focusId,
    clearFocus: () => setFocus(null),
    type: BUG,
    types: [BUG],
    openSettings: vi.fn(),
  };
  return (
    <FormBuilderContext.Provider value={value}>
      <div ref={scrollRef}>
        <FormBuilderColumn scrollRef={scrollRef} hasDestinations={false} />
      </div>
    </FormBuilderContext.Provider>
  );
}

describe('someone who may not edit (a Participant, a Viewer)', () => {
  it('sees the form as respondents do, and nothing to edit', () => {
    render(<Harness canEdit={false} />);
    expect(screen.getByRole('heading', { name: 'Bug Report' })).toBeTruthy();
    expect(screen.getByText('Summary')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Edit question/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Form heading' })).toBeNull();
  });
});

describe('an Editor', () => {
  it('selects a question to edit it, and Escape lets go', () => {
    render(<Harness canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit question: Summary' }));
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Question' }).value).toBe(
      'Summary',
    );
    expect(screen.getByText('Title')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Question' }), { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Question' })).toBeNull();
  });

  // A question opens through its own edit button; the card is no button, so its grip is not a control in a control.
  it('opens a question through an edit button that holds none of the card’s other controls', () => {
    const { container } = render(<Harness canEdit />);
    const edit = screen.getByRole('button', { name: 'Edit question: Summary' });
    const card = container.querySelector('[data-form-question]')!;
    expect(card.getAttribute('role')).toBeNull();
    expect(edit.querySelector('button')).toBeNull();
    expect(edit.contains(screen.getByRole('button', { name: 'Move Summary' }))).toBe(false);
  });

  it('turns Required off, duplicates, moves and deletes, each one edit', () => {
    render(<Harness canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit question: Summary' }));
    fireEvent.click(screen.getByRole('switch', { name: /Required/ }));
    expect(questionsOf(latest)[0]!.required).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Move Down' }));
    expect(questionsOf(latest).map((q) => q.id)).toEqual(['q-2', 'q-1']);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(questionsOf(latest)).toHaveLength(3);
    // The copy is selected and goes nowhere special.
    expect(questionsOf(latest)[2]!.goesTo).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Delete question' }));
    expect(questionsOf(latest)).toHaveLength(2);
  });

  it('adds a question of the selected one’s type after it, focused', () => {
    render(<Harness canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit question: Severity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Single Choice' }));
    const qs = questionsOf(latest);
    expect(qs.map((q) => q.type)).toEqual(['short', 'single', 'single']);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Question' }));
  });

  it('adds a question of another type from the list', () => {
    render(<Harness canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a question of another type' }));
    fireEvent.click(screen.getByRole('option', { name: 'Rating' }));
    expect(questionsOf(latest).at(-1)).toMatchObject({ type: 'rating', scale: 5, style: 'stars' });
  });

  it('edits options: Enter adds the next, and Other comes and goes', () => {
    render(<Harness canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit question: Severity' }));
    const options = screen.getByRole('list', { name: 'Options' });
    fireEvent.keyDown(within(options).getByRole('textbox', { name: 'Option 2' }), { key: 'Enter' });
    expect(questionsOf(latest)[1]!.options).toEqual(['Low', 'High', 'Option 3']);
    fireEvent.click(screen.getByRole('button', { name: 'Add “Other”' }));
    expect(questionsOf(latest)[1]!.other).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Other' }));
    expect(questionsOf(latest)[1]!.other).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Low' }));
    expect(questionsOf(latest)[1]!.options).toEqual(['High', 'Option 3']);
  });

  it('changes a question’s type from its type button', () => {
    render(<Harness canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit question: Severity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Question type: Single Choice' }));
    fireEvent.click(screen.getByRole('option', { name: 'Multiple Choice' }));
    expect(questionsOf(latest)[1]).toMatchObject({ type: 'multi', options: ['Low', 'High'] });
  });

  it('splits the form with Add Section, and the new section can be removed', () => {
    render(<Harness canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit question: Summary' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Section' }));
    expect(latest.sections.map((s) => s.questions.map((q) => q.id))).toEqual([['q-1'], ['q-2']]);
    expect(screen.getByText('Section 2 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete section 2' }));
    expect(latest.sections).toHaveLength(1);
  });

  it('renames the form from its heading, once typing pauses', async () => {
    vi.useFakeTimers();
    try {
      render(<Harness canEdit />);
      fireEvent.change(screen.getByRole('textbox', { name: 'Form heading' }), {
        target: { value: 'Defects' },
      });
      await act(async () => vi.advanceTimersByTime(600));
      expect(latest.heading).toBe('Defects');
    } finally {
      vi.useRealTimers();
    }
  });
});

// docs/specs/004-interface-design/sizing.md D237: the form as respondents see it keeps the form's own type (forms.css
// form-type-*); the builder's own controls are on the sizing scale.
describe('the builder on the sizing scale', () => {
  const TRACKED_OR_HEAVY = /\buppercase\b|tracking-wider|font-semibold|font-bold/;

  it('draws the form in the form’s own type for someone who may not edit', () => {
    render(<Harness canEdit={false} />);

    expect(screen.getByRole('heading', { name: 'Bug Report' }).className).toContain(
      'form-type-title',
    );
    expect(screen.getByText('Summary').className).toContain('form-type-question');
  });

  it('edits the form in its own type and draws the Editor’s controls from the scale', () => {
    render(<Harness canEdit />);
    expect(screen.getByRole('textbox', { name: 'Form heading' }).className).toContain(
      'form-type-title',
    );
    expect(screen.getByRole('textbox', { name: 'Form description' }).className).toContain(
      'form-type-lead',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit question: Summary' }));

    expect(screen.getByRole('textbox', { name: 'Question' }).className).toContain(
      'form-type-question',
    );
    const type = screen.getByRole('button', { name: /Question type/ }).className;
    expect(type).toContain('h-field');
    expect(type).toContain('text-body');
    expect(type).not.toContain('font-medium');
    expect(screen.getByRole('button', { name: 'Move Down' }).className).toContain('size-row');
    expect(screen.getByRole('button', { name: 'Delete question' }).className).toContain('size-row');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('draws the builder’s menus, popovers and add bar from the scale', () => {
    render(<Harness canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit question: Summary' }));

    const add = screen.getByRole('button', { name: 'Add a question of another type' });
    expect(add.className).toContain('h-prominent');
    fireEvent.click(add);
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options[0]!.className).toContain('h-row');
    expect(options[0]!.className).toContain('text-body');
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: /^Answer goes to/ }));
    const sheet = screen.getByRole('dialog', { name: 'Answer Goes To' });
    for (const radio of within(sheet).getAllByRole('radio')) {
      expect(radio.className).toContain('text-body');
    }
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });
});
