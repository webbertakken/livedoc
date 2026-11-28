// @vitest-environment jsdom
// docs/specs/034-text-documents/starting-and-finding.md "Where the gallery shows".
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TextTemplateGallery } from './TextTemplateGallery';

describe('the template gallery page', () => {
  it('offers a blank document, then every section’s templates by name', () => {
    render(<TextTemplateGallery busy={false} onChoose={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Template gallery');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Start a new document',
      'Letters',
      'Resumes',
      'Personal',
      'Work',
      'Education',
    ]);
    expect(screen.getAllByRole('button')).toHaveLength(16);
  });

  it('chooses a template, or the blank', () => {
    const onChoose = vi.fn<(choice: string) => void>();
    render(<TextTemplateGallery busy={false} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Working backwards' }));
    fireEvent.click(screen.getByRole('button', { name: 'Blank document' }));
    expect(onChoose.mock.calls).toEqual([['text-working-backwards'], ['blank']]);
  });

  it('takes no second choice while the first is being made', () => {
    render(<TextTemplateGallery busy onChoose={() => {}} />);
    for (const button of screen.getAllByRole('button'))
      expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
