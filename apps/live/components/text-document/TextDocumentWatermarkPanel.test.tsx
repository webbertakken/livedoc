// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Watermark" (The panel): Image dimmed, Text chosen; each choice applied at
// once; the words once typing pauses or the field is left; Remove watermark empties it; Done closes the panel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Watermarks, type Watermark } from '@livedoc/text-documents';
import {
  TextDocumentWatermarkPanel,
  WATERMARK_TYPING_PAUSE_MS,
} from './TextDocumentWatermarkPanel';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const DRAFT = Watermarks.text('DRAFT');

const panel = (watermark: Watermark | undefined) => {
  const onApply = vi.fn();
  const onDone = vi.fn();
  render(<TextDocumentWatermarkPanel watermark={watermark} onApply={onApply} onDone={onDone} />);
  return { onApply, onDone };
};
const field = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Text' });

describe('TextDocumentWatermarkPanel', () => {
  it('opens on Text with Image dimmed, and none to remove without a watermark', () => {
    panel(undefined);
    expect(screen.getByRole('tab', { name: 'Image' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Text' }).getAttribute('aria-selected')).toBe('true');
    expect(field().value).toBe('');
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Remove watermark' }).disabled,
    ).toBe(true);
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Size' }).value).toBe('auto');
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Diagonal' }).checked).toBe(true);
  });

  it('applies the words once typing pauses, and at once when the field is left', () => {
    const { onApply } = panel(undefined);
    fireEvent.change(field(), { target: { value: 'DRA' } });
    fireEvent.change(field(), { target: { value: 'DRAFT' } });
    expect(onApply).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(WATERMARK_TYPING_PAUSE_MS);
    });
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(DRAFT);
    fireEvent.change(field(), { target: { value: 'COPY' } });
    fireEvent.blur(field());
    expect(onApply).toHaveBeenLastCalledWith(Watermarks.text('COPY'));
  });

  it('applies each other choice at once', () => {
    const { onApply } = panel(DRAFT);
    fireEvent.change(screen.getByRole('combobox', { name: 'Size' }), { target: { value: '48' } });
    expect(onApply).toHaveBeenLastCalledWith({ ...DRAFT, size: 48 });
    fireEvent.change(screen.getByRole('combobox', { name: 'Font' }), {
      target: { value: 'Georgia' },
    });
    expect(onApply).toHaveBeenLastCalledWith({ ...DRAFT, font: 'Georgia' });
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(onApply).toHaveBeenLastCalledWith({ ...DRAFT, bold: true });
    fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
    expect(onApply).toHaveBeenLastCalledWith({ ...DRAFT, italic: true });
    fireEvent.click(screen.getByRole('radio', { name: 'Horizontal' }));
    expect(onApply).toHaveBeenLastCalledWith({ ...DRAFT, layout: 'horizontal' });
    const slider = screen.getByRole('slider', { name: 'Transparency' });
    fireEvent.change(slider, { target: { value: '20' } });
    expect(slider.getAttribute('aria-valuetext')).toBe('20%');
    expect(onApply).toHaveBeenCalledTimes(5);
    fireEvent.pointerUp(slider);
    expect(onApply).toHaveBeenLastCalledWith({ ...DRAFT, transparency: 0.2 });
  });

  it('turns a size back to Auto, and bold and italic off', () => {
    const { onApply } = panel({ ...DRAFT, size: 48, bold: true, italic: true });
    expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByRole('combobox', { name: 'Size' }), { target: { value: 'auto' } });
    expect(onApply).toHaveBeenLastCalledWith({ ...DRAFT, bold: true, italic: true });
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(onApply).toHaveBeenLastCalledWith({ ...DRAFT, size: 48, italic: true });
    fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
    expect(onApply).toHaveBeenLastCalledWith({ ...DRAFT, size: 48, bold: true });
  });

  it('removes the watermark, and Done applies what was typed and closes', () => {
    const { onApply, onDone } = panel(DRAFT);
    fireEvent.click(screen.getByRole('button', { name: 'Remove watermark' }));
    expect(onApply).toHaveBeenLastCalledWith(undefined);
    fireEvent.change(field(), { target: { value: 'FINAL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onApply).toHaveBeenLastCalledWith({ ...DRAFT, text: 'FINAL' });
    expect(onDone).toHaveBeenCalled();
  });
});
