// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Element, Layer } from '@livedoc/document';
import { clearLocalPreview } from '@/lib/drag-preview';
import { openAnswer, resetStructureViewForTests, structureViewFor } from '@/lib/structure-view';
import { StructureMarks } from './StructureMarks';

// What a hotspot's answer shows on the canvas (docs/specs/021-event-storming/board-structure.md "Hotspot answers").

const TAB = 'tab-1';
const hotspot = (id: string, extra: Record<string, unknown> = {}): Element => ({
  id,
  type: 'sticky',
  x: 100,
  y: 40,
  width: 140,
  height: 140,
  label: `${id}?`,
  esKind: 'hotspot',
  ...extra,
});

const marks = () => [...document.querySelectorAll<HTMLElement>('[data-answer-mark]')];
const field = () => screen.queryByRole<HTMLTextAreaElement>('textbox', { name: 'Answer' });

afterEach(() => {
  cleanup();
  clearLocalPreview();
  resetStructureViewForTests();
});

describe('StructureMarks', () => {
  it('draws a check on each answered hotspot, at its top right corner, and none on an open one', () => {
    render(
      <StructureMarks
        tabId={TAB}
        elements={[hotspot('who', { esAnswer: 'The host.' }), hotspot('why')]}
      />,
    );
    const [mark, ...rest] = marks();
    expect(rest).toEqual([]);
    expect(mark!.dataset.answerMark).toBe('who');
    const corner = mark!.parentElement!.parentElement!;
    expect(corner.style.left).toBe('240px');
    expect(corner.style.top).toBe('40px');
  });

  it('draws nothing on a board with no answer', () => {
    const { container } = render(<StructureMarks tabId={TAB} elements={[hotspot('why')]} />);
    expect(container.innerHTML).toBe('');
  });

  it('leaves out a suggested hotspot and one on a hidden layer', () => {
    const layers: Layer[] = [{ id: 'l', name: 'Hidden', visible: false }];
    render(
      <StructureMarks
        tabId={TAB}
        layers={layers}
        elements={[
          hotspot('hidden', { esAnswer: 'Yes.', layerId: 'l' }),
          hotspot('offered', { esAnswer: 'Yes.', esSuggestion: { by: 'agent' } }),
        ]}
      />,
    );
    expect(marks()).toEqual([]);
  });

  it('shows the answer as a caption while the check is pointed at', () => {
    render(<StructureMarks tabId={TAB} elements={[hotspot('who', { esAnswer: 'The host.' })]} />);
    const mark = marks()[0]!;
    expect(document.querySelector('[data-answer-caption]')).toBeNull();
    fireEvent.pointerEnter(mark);
    expect(document.querySelector('[data-answer-caption]')!.textContent).toContain('The host.');
    fireEvent.pointerLeave(mark);
    expect(document.querySelector('[data-answer-caption]')).toBeNull();
  });

  it('opens the field from the check for whoever may answer, and keeps what is typed', () => {
    const onAnswer = vi.fn<(id: string, text: string) => void>();
    render(
      <StructureMarks
        tabId={TAB}
        elements={[hotspot('who', { esAnswer: 'The host.' })]}
        onAnswer={onAnswer}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Answered: The host.' }));
    expect(structureViewFor(TAB).answeringId).toBe('who');
    fireEvent.change(field()!, { target: { value: 'The floor manager.' } });
    fireEvent.keyDown(field()!, { key: 'Enter' });
    expect(onAnswer).toHaveBeenCalledWith('who', 'The floor manager.');
    expect(structureViewFor(TAB).answeringId).toBeNull();
    expect(field()).toBeNull();
  });

  it('opens the field on an open hotspot, which wears no check', () => {
    const onAnswer = vi.fn();
    render(<StructureMarks tabId={TAB} elements={[hotspot('why')]} onAnswer={onAnswer} />);
    act(() => openAnswer(TAB, 'why'));
    expect(field()!.value).toBe('');
    expect(screen.getByRole('group', { name: 'Answer to: why?' })).toBeTruthy();
    fireEvent.keyDown(field()!, { key: 'Escape' });
    expect(onAnswer).not.toHaveBeenCalled();
    expect(field()).toBeNull();
  });

  it('opens nothing for whoever may not answer', () => {
    render(<StructureMarks tabId={TAB} elements={[hotspot('who', { esAnswer: 'The host.' })]} />);
    act(() => openAnswer(TAB, 'who'));
    expect(field()).toBeNull();
    expect(structureViewFor(TAB).answeringId).toBeNull();
  });

  it('closes the field when its note goes or stops being a hotspot', () => {
    const onAnswer = vi.fn();
    const { rerender } = render(
      <StructureMarks tabId={TAB} elements={[hotspot('why')]} onAnswer={onAnswer} />,
    );
    act(() => openAnswer(TAB, 'why'));
    expect(field()).not.toBeNull();
    rerender(
      <StructureMarks
        tabId={TAB}
        elements={[hotspot('why', { esKind: 'command' })]}
        onAnswer={onAnswer}
      />,
    );
    expect(field()).toBeNull();
    expect(structureViewFor(TAB).answeringId).toBeNull();
  });

  it('closes the field when its board is left', () => {
    const { unmount } = render(
      <StructureMarks tabId={TAB} elements={[hotspot('why')]} onAnswer={vi.fn()} />,
    );
    act(() => openAnswer(TAB, 'why'));
    unmount();
    expect(structureViewFor(TAB).answeringId).toBeNull();
  });
});
