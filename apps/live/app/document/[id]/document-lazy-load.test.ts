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

const isPackage = (specifier: string) => !specifier.startsWith('@/') && !specifier.startsWith('.');

// The value names a source takes from packages, by `import { a, b as c, type T } from 'pkg'` (types skipped).
type NamedFromPackage = { from: string; name: string };
const namedFromPackages = (src: string, statement: RegExp): NamedFromPackage[] =>
  [...src.matchAll(statement)]
    .filter((m) => isPackage(m[2]!))
    .flatMap((m) =>
      m[1]!
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '' && !part.startsWith('type '))
        .map((part) => ({ from: m[2]!, name: part.split(/\s+as\s+/)[0]! })),
    );
const packageImports = (src: string) =>
  namedFromPackages(src, /^import\s+\{([^}]*)\}\s*from\s+'([^']+)'/gm);
const packageReExports = (src: string) =>
  namedFromPackages(src, /^export\s+\{([^}]*)\}\s*from\s+'([^']+)'/gm);

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

// A package's modules as the bundler shakes them: a name taken from the package is its defining module's, and a module
// brings in every module it takes a value from (a name it takes from the package's index, its defining module).
const repoRoot = join(root, '..', '..');
const VALUE_DECLARATION =
  /^export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|enum)\s+(\w+)/gm;
const NAMED_FROM = /^(import|export)\s+(?!type\b)\{([^}]*)\}\s*from\s+'\.\/([^']+)'/gm;
const parts = (list: string) =>
  list
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '' && !part.startsWith('type '))
    .map((part) => {
      const [own, as] = part.split(/\s+as\s+/);
      return { own: own!, as: as ?? own! };
    });

// What one module says about names: those it declares, re-exports or passes on, and the modules it takes values from.
type PackageModule = {
  declared: Set<string>;
  // A name exported from another module of the package, by its name there.
  forwarded: Map<string, { from: string; name: string }>;
  stars: string[];
  dependencies: { from: string; names: string[] | null }[];
};

function readPackageModule(dir: string, mod: string): PackageModule {
  const src = readFileSync(join(dir, `${mod}.ts`), 'utf8');
  const declared = new Set([...src.matchAll(VALUE_DECLARATION)].map((m) => m[1]!));
  const forwarded = new Map<string, { from: string; name: string }>();
  const imported = new Map<string, string>();
  const dependencies: PackageModule['dependencies'] = [];
  for (const m of src.matchAll(NAMED_FROM)) {
    const names = parts(m[2]!);
    if (m[1] === 'import') for (const p of names) imported.set(p.as, m[3]!);
    else for (const p of names) forwarded.set(p.as, { from: m[3]!, name: p.own });
    // The index's re-exports are taken by name, never as a whole.
    if (names.length > 0 && !(mod === 'index' && m[1] === 'export'))
      dependencies.push({ from: m[3]!, names: names.map((p) => p.own) });
  }
  // `import { a } from './x'; export { a };`
  for (const m of src.matchAll(/^export\s+\{([^}]*)\}\s*;/gm))
    for (const p of parts(m[1]!)) {
      const from = imported.get(p.own);
      if (from) forwarded.set(p.as, { from, name: p.own });
    }
  const stars = [...src.matchAll(/^export\s+\*\s+from\s+'\.\/([^']+)'/gm)].map((m) => m[1]!);
  if (mod !== 'index') for (const from of stars) dependencies.push({ from, names: null });
  for (const m of src.matchAll(
    /^import\s+(?!type\b)(?:(?:\*\s+as\s+)?\w+\s+from\s+)?'\.\/([^']+)'/gm,
  ))
    dependencies.push({ from: m[1]!, names: null });
  return { declared, forwarded, stars, dependencies };
}

function packageModules(pkg: string) {
  const name = /^@livedoc\/([\w-]+)$/.exec(pkg)?.[1];
  const dir = name ? join(repoRoot, 'packages', name, 'src') : null;
  if (!dir || !existsSync(join(dir, 'index.ts'))) return null;
  const modules = new Map<string, PackageModule>();
  const moduleOf = (mod: string) => {
    if (!modules.has(mod)) modules.set(mod, readPackageModule(dir, mod));
    return modules.get(mod)!;
  };
  // The module that defines `name` for one taking it from `mod`.
  const definer = (mod: string, name: string, seen = new Set<string>()): string | null => {
    if (seen.has(mod)) return null;
    seen.add(mod);
    const m = moduleOf(mod);
    if (m.declared.has(name)) return mod;
    const next = m.forwarded.get(name);
    if (next) return definer(next.from, next.name, seen);
    for (const from of m.stars) {
      const found = definer(from, name, seen);
      if (found) return found;
    }
    return null;
  };
  // Every module reached from those defining `names`, each module bringing in what it takes values from.
  const reachedBy = (names: readonly string[]) => {
    const seen = new Set(names.map((n) => definer('index', n)).filter((m): m is string => !!m));
    const queue = [...seen];
    while (queue.length > 0) {
      for (const dep of moduleOf(queue.pop()!).dependencies) {
        const targets =
          dep.from === 'index' && dep.names
            ? dep.names.map((n) => definer('index', n)).filter((m): m is string => !!m)
            : [dep.from];
        for (const next of targets) {
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return seen;
  };
  return { definer: (n: string) => definer('index', n), reachedBy };
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
    const local = reExports(read(entry)).filter((s) => !isPackage(s));
    const faces = local.map((s) => resolveLocal(join(root, entry), s)!);
    expect(faces.every(Boolean)).toBe(true);
    expect(faces.filter((face) => firstLoad.has(face))).toEqual([]);
  });

  // A family's model parts come from a package (the family's entry re-exports them): no file of the first load
  // imports one of them from that package itself.
  it.each(families)('%s’s model parts are not imported by the first load', (family) => {
    const parts = packageReExports(read(`${familiesDir}/${family}`));
    const imported = [...firstLoad].flatMap((file) =>
      packageImports(read(file))
        .filter(({ from, name }) => parts.some((p) => p.from === from && p.name === name))
        .map(({ name }) => `${file}: ${name}`),
    );
    expect(imported).toEqual([]);
  });

  // Nor through the package: no module the first load takes a value from imports, in turn, a module that defines one
  // of them (a model part split from its wire, as sankey-wire.ts from sankey-model.ts, stays split).
  it.each(families)('%s’s model modules are not reached through their package', (family) => {
    const parts = packageReExports(read(`${familiesDir}/${family}`));
    for (const pkg of new Set(parts.map((p) => p.from))) {
      const modules = packageModules(pkg);
      if (!modules) continue;
      const own = parts.filter((p) => p.from === pkg).map((p) => modules.definer(p.name));
      expect(own.every(Boolean)).toBe(true);
      const taken = [...firstLoad].flatMap((file) =>
        packageImports(read(file))
          .filter(({ from }) => from === pkg)
          .map(({ name }) => name),
      );
      const reached = modules.reachedBy(taken);
      expect(own.filter((m) => reached.has(m!))).toEqual([]);
    }
  });
});
