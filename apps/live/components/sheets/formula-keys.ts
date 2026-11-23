// The keys an edit keeps for itself beyond saving and moving (docs/specs/029-sheets/grid-and-editing.md "Editing",
// "Formulas"; keyboard-shortcuts.md): a line break, array entry and F4's anchors, read as Google gives them for the
// platform. Ctrl+Enter is a Mac's line break; elsewhere it fills, as ⌘+Enter does on a Mac.
import type { OfficePlatform } from '@/lib/office/shortcut-notation';

type EditKey = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

export type FormulaKey = 'lineBreak' | 'arrayEntry' | 'anchors';

export function formulaKey(e: EditKey, platform: OfficePlatform): FormulaKey | null {
  if (e.key === 'F4') return e.ctrlKey || e.metaKey || e.altKey || e.shiftKey ? null : 'anchors';
  if (e.key !== 'Enter') return null;
  if (e.altKey) return 'lineBreak';
  if ((e.ctrlKey || e.metaKey) && e.shiftKey) return 'arrayEntry';
  if (platform === 'mac' && e.ctrlKey && !e.metaKey) return 'lineBreak';
  return null;
}
