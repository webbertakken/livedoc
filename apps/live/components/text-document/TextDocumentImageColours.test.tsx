// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Working with a picture" (Recolour, Adjustments): a radio group of No
// recolour, Light 1 to 8 and Dark 1 to 8, the picture's checked, arrows moving and choosing; sliders in percent showing
// their value as they move, written once let go and only when changed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ImageAdjustments, ImageRecolour } from './TextDocumentImageColours';

afterEach(cleanup);

describe('ImageRecolour', () => {
  it('checks the picture’s recolour, none for one of its own', () => {
    const onColour = vi.fn();
    const { rerender } = render(
      <ImageRecolour
        recolour={{ kind: 'duotone', dark: '#ff0000', light: '#ffffff' }}
        onColour={onColour}
      />,
    );
    expect(screen.getAllByRole('radio')).toHaveLength(17);
    expect(screen.getByRole('radio', { name: 'Light 2' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    rerender(<ImageRecolour recolour={{ kind: 'greyscale' }} onColour={onColour} />);
    expect(screen.queryByRole('radio', { checked: true })).toBeNull();
    // With none checked, the first is the one Tab reaches.
    expect(screen.getByRole('radio', { name: 'No recolour' }).tabIndex).toBe(0);
  });

  it('chooses a recolour by a press', () => {
    const onColour = vi.fn();
    render(<ImageRecolour recolour={undefined} onColour={onColour} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dark 8' }));
    expect(onColour).toHaveBeenCalledWith({
      recolour: { kind: 'duotone', dark: '#000000', light: '#9900ff' },
    });
  });

  it('moves and chooses by the arrows: by one, and by a row among the swatches', () => {
    const onColour = vi.fn();
    render(<ImageRecolour recolour={undefined} onColour={onColour} />);
    const none = screen.getByRole('radio', { name: 'No recolour' });
    fireEvent.keyDown(none, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Light 1' }));
    expect(onColour).toHaveBeenLastCalledWith({
      recolour: { kind: 'duotone', dark: '#666666', light: '#ffffff' },
    });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Dark 1' }));
    fireEvent.keyDown(none, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Dark 8' }));
  });
});

describe('ImageAdjustments', () => {
  const colours = { transparency: 10, brightness: -20 };

  it('shows each adjustment in percent, in its range', () => {
    render(<ImageAdjustments colours={colours} onColour={vi.fn()} />);
    const brightness = screen.getByRole<HTMLInputElement>('slider', { name: 'Brightness' });
    expect([brightness.min, brightness.max, brightness.value]).toEqual(['-100', '100', '-20']);
    expect(brightness.getAttribute('aria-valuetext')).toBe('-20%');
    expect(screen.getByRole<HTMLInputElement>('slider', { name: 'Contrast' }).value).toBe('0');
    expect(screen.getByRole<HTMLInputElement>('slider', { name: 'Transparency' }).min).toBe('0');
  });

  it('shows the value as it moves and writes it once let go', () => {
    const onColour = vi.fn();
    render(<ImageAdjustments colours={colours} onColour={onColour} />);
    const contrast = screen.getByRole('slider', { name: 'Contrast' });
    fireEvent.change(contrast, { target: { value: '35' } });
    expect(screen.getByText('35%')).toBeTruthy();
    expect(onColour).not.toHaveBeenCalled();
    fireEvent.pointerUp(contrast);
    expect(onColour).toHaveBeenCalledWith({ adjustment: 'contrast', value: 35 });
    fireEvent.keyUp(contrast, { key: 'ArrowRight' });
    fireEvent.blur(contrast);
    expect(onColour).toHaveBeenCalledTimes(1);
  });
});
