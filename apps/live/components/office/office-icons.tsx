// The office title row's glyphs, from the vendored Lucide set (docs/specs/004-interface-design/iconography.md).
import {
  lucideAppWindow,
  lucideBold,
  lucideCloudAlert,
  lucideCloudCheck,
  lucideCloudOff,
  lucideCloudSync,
  lucideCopy,
  lucideFolderInput,
  lucideItalic,
  lucideLock,
  lucideSettings,
  lucideStar,
  lucideUsers,
} from '@livedoc/icons/lucide';
import { lucideGlyph } from '@livedoc/ui';

export const OfficeStarIcon = lucideGlyph(lucideStar, 18);
export const OfficeMoveIcon = lucideGlyph(lucideFolderInput, 18);
export const OfficeSettingsIcon = lucideGlyph(lucideSettings, 20);
export const OfficeLockIcon = lucideGlyph(lucideLock, 16);
export const OfficeCopyIcon = lucideGlyph(lucideCopy, 16);
export const OfficeSharedIcon = lucideGlyph(lucideUsers, 16);
// The watermark panel's Bold and Italic (page-layout.md "Watermark").
export const OfficeBoldIcon = lucideGlyph(lucideBold, 18);
export const OfficeItalicIcon = lucideGlyph(lucideItalic, 18);

// The save status's glyphs, one per status (editing-surface.md "The title row").
export const OfficeSaveIcons = {
  saving: lucideGlyph(lucideCloudSync, 18),
  saved: lucideGlyph(lucideCloudCheck, 18),
  'this-browser': lucideGlyph(lucideAppWindow, 18),
  offline: lucideGlyph(lucideCloudOff, 18),
  failed: lucideGlyph(lucideCloudAlert, 18),
} as const;
