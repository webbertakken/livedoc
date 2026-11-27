// Screen reader support (docs/specs/034-text-documents/tools.md "Accessibility settings"): the person's setting, and
// the words the switch says. Kept in their preferences, missing === off.
import { readUserPreferences, writeUserPreferences } from '@/lib/user-preferences';

/** What the live region says as the switch turns (Google's words). */
export const SCREEN_READER_ENABLED = 'Screen reader support enabled';
export const SCREEN_READER_DISABLED = 'Screen reader support disabled';

/** The dialog's sentence in place of Google's braille and magnifier switches (director, 2026-11-27). */
export const NATIVE_SUPPORT_SENTENCE =
  'Braille displays and screen magnifiers follow LiveDoc’s text directly; nothing to turn on.';

/** Tools > Accessibility, and the Accessibility menu's own Accessibility settings. */
export const ACCESSIBILITY_ITEM = 'accessibility';
export const ACCESSIBILITY_SETTINGS_ITEM = 'accessibility-settings';

/** The shortcut row that turns screen reader support on and off. */
export const SCREEN_READER_KEY = 'enable-screen-reader-support';

export const readScreenReaderSupport = (): boolean =>
  readUserPreferences().screenReaderSupport === true;

/** Keeps the setting, with the account where signed in, else this browser. */
export function writeScreenReaderSupport(on: boolean, ownerId: string | null): void {
  const { screenReaderSupport: _was, ...rest } = readUserPreferences();
  writeUserPreferences(on ? { ...rest, screenReaderSupport: true } : rest, ownerId);
}
