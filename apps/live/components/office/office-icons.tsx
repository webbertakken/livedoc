// The office title row's glyphs, from the vendored Lucide set (docs/specs/004-interface-design/iconography.md).
import {
  lucideCopy,
  lucideFolderInput,
  lucideLock,
  lucideSettings,
  lucideStar,
} from '@livedoc/icons/lucide';
import { lucideGlyph } from '@livedoc/ui';

export const OfficeStarIcon = lucideGlyph(lucideStar, 18);
export const OfficeMoveIcon = lucideGlyph(lucideFolderInput, 18);
export const OfficeSettingsIcon = lucideGlyph(lucideSettings, 20);
export const OfficeLockIcon = lucideGlyph(lucideLock, 16);
export const OfficeCopyIcon = lucideGlyph(lucideCopy, 16);
