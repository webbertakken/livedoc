// The toolbar's Paint Format (docs/specs/029-sheets/formatting.md "Paint format and clearing"; sheet.md "Paint
// Format"): a press holds the selection's formats for the next range selected, a double-click keeps it on, and a press
// while it holds them lets go. Pressed while it holds them.
import type { OfficeAction } from '@/lib/office/office-catalogue';

export function paintFormatBinding({
  painting,
  start,
  stop,
}: {
  painting: boolean;
  start: (keep: boolean) => void;
  stop: () => void;
}): OfficeAction {
  return {
    run: () => (painting ? stop() : start(false)),
    double: () => start(true),
    checked: painting,
  };
}
