// What the document page loads on demand (docs/specs/016-platform/web-performance.md; lib/editor-deferred-code.ts).
// Each of these was a static import that put a surface most visits never open, or content most boards never
// draw, in every document's first load: together about 224 KiB gzipped. A static import of any of them again
// passes every other test; this one fails.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const staticImports = (src: string) =>
  [...src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms)].map((m) => m[1]!);
const importsOf = (path: string) => staticImports(read(path));

describe('the document page’s first load', () => {
  it.each([
    ['app/document/[id]/EditorView.tsx', '@/components/panels/EditorSearchPanel'],
    ['components/chrome/EditorPhotoImport.tsx', '@/components/chrome/PhotoReviewOverlay'],
    ['components/chrome/EditorPhotoImport.tsx', '@/lib/photo-detect'],
    ['components/tour/EditorTours.tsx', '@/components/tour/PlanTourHost'],
    ['components/tour/EditorTours.tsx', '@/components/tour/ElementTourHost'],
    ['app/document/[id]/editor-page.tsx', '@/components/panels/Explorer'],
    ['components/canvas/useCanvasChromePanels.tsx', '@/components/panels/Explorer'],
    ['components/canvas/useCanvasChromePanels.tsx', '@/components/panels/LayersPanel'],
    ['components/canvas/Canvas.tsx', '@/components/canvas/CanvasPages'],
    ['components/canvas/Canvas.tsx', '@/components/canvas/article/ArticleFlows'],
    ['components/canvas/CanvasChrome.tsx', '@/components/canvas/whiteboard/WhiteboardDock'],
    ['components/canvas/ElementFaceRouter.tsx', '@/components/canvas/TableView'],
    ['components/canvas/ElementFaceRouter.tsx', '@/components/canvas/collab/CollabFaceRouter'],
    ['components/canvas/QuickStyleHost.tsx', '@/components/canvas/QuickStylePanel'],
    ['components/canvas/PresentationHost.tsx', '@/components/canvas/PresentationOverlay'],
    ['components/canvas/SessionTimerFace.tsx', '@/components/canvas/SessionElementSettings'],
    ['components/canvas/SessionSettingsMenu.tsx', '@/components/canvas/SessionElementSettings'],
    ['hooks/canvas/usePhotoDraft.ts', '@/lib/photo-detect'],
    ['hooks/canvas/usePhotoReread.ts', '@/lib/photo-detect'],
    ['components/canvas/view-readers.tsx', '@/components/canvas/Minimap'],
    ['components/canvas/ElementFaceRouter.tsx', '@/components/canvas/SequenceFace'],
    ['hooks/canvas/useBoardSceneInsert.ts', '@/lib/board-scene/land'],
    ['hooks/persistence/useBoardSceneImport.ts', '@/lib/board-scene/land'],
    ['hooks/persistence/useBoardSceneImport.ts', '@/lib/board-scene-import'],
  ])('%s loads %s on demand', (file, module) => {
    expect(importsOf(file)).not.toContain(module);
  });

  it('loads the tool panels on demand', () => {
    const imports = importsOf('components/canvas/useCanvasToolPanels.tsx');
    expect(imports.filter((m) => m.startsWith('@/components/panels/'))).toEqual([]);
  });

  it('takes the template overrides from the builders loaded at the press', () => {
    const src = read('app/document/[id]/useTemplateFlow.ts');
    expect(src).not.toMatch(/^import\s+\{[^}]*\btemplateCanvasOverrides\b/m);
  });

  it('takes the template catalogue from the builders loaded at the press', () => {
    const imports = importsOf('app/document/[id]/useTemplateFlow.ts');
    expect(imports).not.toContain('@livedoc/templates');
    expect(imports).not.toContain('@/lib/template-tab-name');
  });
});

// docs/specs/016-platform/web-performance.md "An element kind's code loads with the board that holds it": no module a
// kind family's entry names is reachable from the document page by static imports. The walk follows the editor's own
// files (`@/` and relative); `scripts/first-load-why.mjs live 'document/[id]' why <module>` names a chain it finds.
const SOURCE_EXTENSIONS = ['.tsx', '.ts', '/index.tsx', '/index.ts'];
const reExports = (src: string) =>
  [...src.matchAll(/^export\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms)].map((m) => m[1]!);

function resolveLocal(from: string, specifier: string): string | null {
  const base = specifier.startsWith('@/')
    ? specifier.slice(2)
    : specifier.startsWith('.')
      ? join(from, '..', specifier).slice(root.length + 1)
      : null;
  if (base === null) return null;
  for (const ext of ['', ...SOURCE_EXTENSIONS]) {
    const candidate = `${base}${ext}`;
    if (/\.(ts|tsx)$/.test(candidate) && existsSync(join(root, candidate))) return candidate;
  }
  return null;
}

function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    const src = read(file);
    for (const specifier of [...staticImports(src), ...reExports(src)]) {
      const next = resolveLocal(join(root, file), specifier);
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

describe('the element kind families', () => {
  const familiesDir = 'lib/element-kinds/families';
  const families = readdirSync(join(root, familiesDir)).filter((f) => f.endsWith('.ts'));
  const firstLoad = reachableFrom('app/document/[id]/page.tsx');

  it('reach the page only through the registry', () => {
    expect(families.length).toBeGreaterThan(0);
    // The walk reaches the board's faces, so a family face imported beside them would be found.
    expect(firstLoad.has('components/canvas/ElementFaceRouter.tsx')).toBe(true);
  });

  it.each(families)('%s is not reachable from the first load', (family) => {
    const entry = `${familiesDir}/${family}`;
    const faces = reExports(read(entry)).map((s) => resolveLocal(join(root, entry), s)!);
    expect(faces.every(Boolean)).toBe(true);
    expect(faces.filter((face) => firstLoad.has(face))).toEqual([]);
  });
});
