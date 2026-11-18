import { parseTabOpening, type TabOpening } from '@livedoc/document';
import { templateKindOf, type TemplateKind } from '@livedoc/templates';

// The /new query params that skip the wizard (docs/specs/007-editor/new-document-route.md): `?blank=1` commits
// a blank document, `?template=<kind>` (built by the templates package's
// templateCreateHref) commits that template, both with the
// Default theme and the template's default name, and land on the editor.
// One reader for both so the page, its bfcache-restore cleanup and the
// pre-hydration guard agree on what counts.

// The params the bypass reads; the bfcache restore strips exactly these so
// Back from the editor lands on the plain wizard with placement intact.
export const WIZARD_BYPASS_PARAMS = ['blank', 'template', 'kind'] as const;

// Which template the query asks to commit without the wizard, or null for
// the wizard itself. `blank` wins when both are present (it is the older,
// documented shortcut); an unknown template kind is ignored rather than
// guessed, so a stale marketing link falls back to the wizard, not a 404.
export function wizardBypassKind(search: string): TemplateKind | null {
  const params = new URLSearchParams(search);
  if (params.has('blank')) return 'blank';
  // A kind's blank (`?kind=text-document`) skips the wizard as Start Blank does; its tab is the kind's.
  if (wizardBypassTabKind(search)) return 'blank';
  // A retired template's kind opens its replacement (templateKindOf).
  return templateKindOf(params.get('template'));
}

// The tab kind a /new URL asks a blank of (docs/specs/034-text-documents/text-document.md "The single-tab
// document"): `?kind=text-document` makes a text document. Any other kind is ignored, so a stale link opens the wizard.
export function wizardBypassTabKind(search: string): 'text-document' | null {
  return new URLSearchParams(search).get('kind') === 'text-document' ? 'text-document' : null;
}

// The template step's presets (`?mode=`, `?q=`; docs/specs/007-editor/new-document-route.md): the
// mode filter to open on, and words to open the search with. Not a bypass: the author still picks.
// An unknown mode, or empty words, is ignored; a mode's old name (`?mode=illustrate`) reads as today's.
export const SEARCH_PRESET_MAX = 60;

export function wizardPresetMode(search: string): TabOpening | null {
  const mode = new URLSearchParams(search).get('mode');
  return parseTabOpening(mode) ?? null;
}

export function wizardPresetQuery(search: string): string | null {
  const q = new URLSearchParams(search).get('q')?.trim().slice(0, SEARCH_PRESET_MAX);
  return q ? q : null;
}

// `?start=blank` (docs/specs/007-editor/new-document-route.md "Start Blank after a mode"): the public sites' Start
// Blank links. Not a bypass: the wizard still asks for a mode, but the chosen mode's blank opens with its start
// closed, as Skip's does, since whoever asked for a blank has already said they want no templates.
const START_BLANK_VALUE = 'blank';

export function wizardStartsBlank(search: string): boolean {
  return new URLSearchParams(search).get('start') === START_BLANK_VALUE;
}

// The placement context params (/new?folder=<id>, /new?team=<id>), pre-seeding the Settings
// step's picker.
const PLACEMENT_PARAMS = ['folder', 'team'] as const;

// Where "Choose another place" leads after a refused placement (docs/specs/007-editor/
// new-document-route.md "Placement rides the create"): /new without the refused placement and
// without the bypass, so the wizard opens with its picker on the root of My Documents. Every other param is kept.
export function choosePlacementAgainUrl(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of [...WIZARD_BYPASS_PARAMS, ...PLACEMENT_PARAMS]) params.delete(key);
  const qs = params.toString();
  return qs ? `/new?${qs}` : '/new';
}

/**
 * The placement context a /new URL carries (docs/specs/013-workspace/team-shared-documents.md): `?folder=<id>`,
 * `?team=<id>` or both file the new document there. A missing param is absent, never the root: neither is no
 * placement, which leaves room for a default folder (docs/specs/013-workspace/default-folders.md "Precedence").
 */
export function placementParamsFromSearch(search: string): { folderId?: string; teamId?: string } {
  const params = new URLSearchParams(search);
  const folderId = params.get('folder') || undefined;
  const teamId = params.get('team') || undefined;
  return { ...(folderId ? { folderId } : {}), ...(teamId ? { teamId } : {}) };
}
