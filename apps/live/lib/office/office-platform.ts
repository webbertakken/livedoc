// Which keyboard a person has (docs/specs/004-interface-design/office-shell.md "Shortcut layer"): a Mac, ChromeOS,
// or a PC for every other machine; and whether the browser is Chrome, where Alt+letter opens the office menus.
import type { OfficePlatform } from './shortcut-notation';

export function officePlatformOf({
  platform,
  userAgent,
}: {
  platform: string;
  userAgent: string;
}): OfficePlatform {
  if (/mac/i.test(platform)) return 'mac';
  if (/chrome ?os|cros/i.test(platform) || /\bCrOS\b/.test(userAgent)) return 'chromeos';
  return 'pc';
}

export function isChromeBrowser(userAgent: string): boolean {
  return /\bChrome\//.test(userAgent) && !/\b(Edg|OPR|SamsungBrowser)\//.test(userAgent);
}

type NavigatorWithData = Navigator & { userAgentData?: { platform?: string } };

// Read once from the browser; a server render (no navigator) reads as a PC in Chrome.
export function currentOfficePlatform(): { platform: OfficePlatform; chrome: boolean } {
  if (typeof navigator === 'undefined') return { platform: 'pc', chrome: true };
  const nav = navigator as NavigatorWithData;
  const platform = nav.userAgentData?.platform || nav.platform || '';
  return {
    platform: officePlatformOf({ platform, userAgent: nav.userAgent }),
    chrome: isChromeBrowser(nav.userAgent),
  };
}
