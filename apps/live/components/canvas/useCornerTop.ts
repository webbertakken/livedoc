import { usePaletteStripBox } from '@/components/chrome/PaletteTray';
import { useViewportWidth } from '@/hooks/ui/useViewportWidth';
import { cornerTopPx } from './corner';

// The suggestions corner's top (docs/specs/021-event-storming/suggestions.md "The suggestions corner"), kept clear of
// the toolbar strip as it moves or the window resizes.
export function useCornerTop(): number {
  return cornerTopPx(usePaletteStripBox(), useViewportWidth());
}
