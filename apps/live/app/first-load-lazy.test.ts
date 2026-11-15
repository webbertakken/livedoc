// What every route of the editor app loads up front (docs/specs/016-platform/web-performance.md).
// The root not-found slot and the root layout's providers ship with EVERY route, sign-in and the
// Explorer included, so a static import from either lands in all of their first loads. A static
// import of the editor from not-found.tsx once put about 1,150 KiB gzipped on every page; these
// keep the heavy pieces behind a dynamic import.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
// What the root layout mounts on every route, and what those modules import on its behalf.
const ROOT_LAYOUT_MODULES = [
  'components/providers/ErrorTelemetryBoot.tsx',
  'components/providers/AuthBridge.tsx',
  'components/drive/DriveMirrorProvider.tsx',
  'hooks/persistence/useAccountApiBootstrap.ts',
  'lib/auth-config.ts',
  'lib/drive/browser-tokens.ts',
  'lib/guest-migration.ts',
  'lib/preferences-sync.ts',
  'lib/telemetry.ts',
  'lib/user-preferences.ts',
];
// Pages someone lands on from an email or another app, with one call to make.
const SMALL_PAGE_MODULES = [
  'components/panels/TeamInviteJoin.tsx',
  'components/panels/TeamInviteDecline.tsx',
  'app/oauth/consent/page.tsx',
  'app/oauth/device/page.tsx',
  'components/drive/DriveConnected.tsx',
  'app/workbench/pair/PairWorkbench.tsx',
];
const staticImports = (src: string) =>
  [...src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms)].map((m) => m[1]!);

describe('every route’s first load', () => {
  it('loads the editor from the not-found slot only when the slot renders', () => {
    const src = read('app/not-found.tsx');
    expect(staticImports(src).some((p) => p.includes('editor-page'))).toBe(false);
    expect(src).toContain("import('./document/[id]/editor-page')");
  });

  it('loads the Drive mirror’s engine only in the tab elected to run it', () => {
    const src = read('components/drive/DriveMirrorProvider.tsx');
    expect(staticImports(src)).not.toContain('@/lib/drive/browser-engine');
    expect(src).toContain("import('@/lib/drive/browser-engine')");
  });
});

describe('the Explorer’s first load', () => {
  it('loads Settings and the move picker on first open', () => {
    const imports = staticImports(read('app/explorer/ExplorerShell.tsx'));
    expect(imports).not.toContain('@/components/dialogs/SettingsDialog');
    expect(imports).not.toContain('@/components/dialogs/MoveToFolderDialog');
  });

  it('loads search with the catalogues it searches, never ahead of it', () => {
    const shell = read('app/explorer/ExplorerShell.tsx');
    const imports = staticImports(shell);
    expect(imports).not.toContain('@/components/panels/SearchPanel');
    expect(imports).not.toContain('@/lib/help-search');
    expect(imports).not.toContain('@/lib/settings-search-items');
    expect(shell).toContain("import('./ExplorerSearch')");
  });

  // Search is fetched ahead beside the editor, and each carries its own copy of what both import: what search names
  // must not bring the editor's code (the shape palette, the sheet engine) with it.
  it('names the settings it searches without the shape palette or the sheet engine', () => {
    expect(staticImports(read('components/dialogs/settings/settings-catalogue.ts'))).not.toContain(
      '@/lib/whiteboard-dock-prefs',
    );
    expect(staticImports(read('lib/whiteboard-dock-position.ts'))).toEqual([]);
    expect(staticImports(read('../../packages/sheets/src/template-start-ids.ts'))).toEqual([]);
  });

  // The template builders are every template's elements: about 400 KiB the Explorer shipped on every page.
  it('loads what makes a document when one is made', () => {
    for (const file of [
      'app/explorer/new-document/start-new-document.ts',
      'lib/new-document/write-new-document.ts',
      'app/new/page.tsx',
    ]) {
      const imports = staticImports(read(file));
      expect(imports, file).not.toContain('@/lib/new-document-content');
      expect(imports, file).not.toContain('@/lib/template-builders');
    }
    expect(read('lib/new-document/new-document-content-loader.ts')).toContain(
      "import('@/lib/new-document-content')",
    );
  });

  // /new's wizard shows without the builders; a link that names a document to make fetches them as /new starts.
  it('keeps the builders out of /new until a document is made or named', () => {
    const page = read('app/new/page.tsx');
    expect(staticImports(page)).toContain('@/lib/new-document/new-document-content-loader');
    expect(page).toContain('prefetchWhenIdle([loadNewDocumentContent])');
    // Before the component: as the page's code first runs, not after hydration.
    const ahead = page.indexOf('fetchAheadForNamedDocument();');
    expect(ahead).toBeGreaterThan(-1);
    expect(ahead).toBeLessThan(page.indexOf('export default'));
  });
});

// The barrel names every call the editor makes, and with it the offline store and the document model.
describe('the api client barrel', () => {
  it('stays out of what the root layout mounts', () => {
    for (const file of ROOT_LAYOUT_MODULES) {
      expect(staticImports(read(file)), file).not.toContain('@/lib/api-client');
    }
  });

  it('stays out of the small pages, which import the api module they call', () => {
    for (const file of SMALL_PAGE_MODULES) {
      expect(staticImports(read(file)), file).not.toContain('@/lib/api-client');
    }
  });
});

// A respondent opens a form from a link, often on a phone. Its cover band paints a fill and a pattern: the page's
// fill tone, never the presets' themes or the export frame, which carry the document model with them.
describe('the form page’s first load', () => {
  it('paints the cover band from the sheet style alone', () => {
    expect(staticImports(read('components/forms/FormCoverBand.tsx'))).not.toContain(
      '@/lib/page-paint',
    );
    expect(staticImports(read('components/forms/FormCoverBand.tsx'))).toContain(
      '@/lib/page-sheet-style',
    );
    expect(staticImports(read('lib/page-sheet-style.ts'))).toEqual([
      '@livedoc/document',
      './page-image-paint',
    ]);
    expect(staticImports(read('lib/page-image-paint.ts'))).toEqual(['@livedoc/document']);
  });

  it('checks its answers against bounds that import nothing, never the type catalogue', () => {
    const itemLimits = read('../../packages/items/src/limits.ts');
    expect(staticImports(itemLimits)).toEqual([]);
    for (const bound of [
      'CUSTOM_CHOICE_OPTIONS_MAX',
      'CUSTOM_CHOICE_OPTION_MAX',
      'ITEMS_MAX',
      'ITEM_TITLE_MAX',
    ]) {
      expect(itemLimits, bound).toContain(`export const ${bound} =`);
    }
    expect(read('../../packages/forms/src/limits.ts')).toContain("from '@livedoc/items'");
  });
});
