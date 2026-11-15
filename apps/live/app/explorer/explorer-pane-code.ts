// The Explorer's panes that load on demand (docs/specs/016-platform/web-performance.md "A surface that is not on
// screen loads when it is"): each is drawn only on its own section, so none sits in the code every section shares.
// In one place, so a pane's dynamic import and the ask ahead of it name the same module.
import type { SelectedNode } from './views';

export const loadHomePane = () =>
  import('@/components/panels/home/HomePane').then((m) => m.HomePane);
export const loadTimelinePane = () =>
  import('@/components/panels/TimelinePane').then((m) => m.TimelinePane);
export const loadInboxPane = () =>
  import('@/components/panels/inbox/InboxPane').then((m) => m.InboxPane);
export const loadTeamInvitesPane = () =>
  import('@/components/panels/TeamInvitesPane').then((m) => m.TeamInvitesPane);
export const loadTeamPane = () => import('@/components/panels/TeamPane').then((m) => m.TeamPane);
export const loadGalleryPane = () =>
  import('@/components/panels/GalleryPane').then((m) => m.GalleryPane);
export const loadThemesPane = () =>
  import('@/components/panels/ThemesPane').then((m) => m.ThemesPane);
export const loadShapeLibrariesPane = () =>
  import('@/components/panels/ShapeLibrariesPane').then((m) => m.ShapeLibrariesPane);
export const loadTrashSection = () => import('./TrashSection').then((m) => m.TrashSection);
export const loadTagsPane = () => import('./tags/TagsPane').then((m) => m.TagsPane);

// The pane each section draws. A browse section is drawn by the shared code and has none.
const PANE_CODE: Partial<Record<SelectedNode['kind'], () => Promise<unknown>>> = {
  home: loadHomePane,
  timeline: loadTimelinePane,
  inbox: loadInboxPane,
  invites: loadTeamInvitesPane,
  team: loadTeamPane,
  gallery: loadGalleryPane,
  themes: loadThemesPane,
  'shape-libraries': loadShapeLibrariesPane,
  trash: loadTrashSection,
  tags: loadTagsPane,
};

export function paneCodeFor(kind: string): (() => Promise<unknown>) | undefined {
  return PANE_CODE[kind as SelectedNode['kind']];
}

// Asks for a section's pane as the section is chosen. A pane draws only once the person is known (and some once the
// documents are listed), so left to its dynamic import its code would be asked for after that answer and its own
// data after its code: three waits in a row where two can share one. A failure is left to the pane's own import.
export function fetchPaneCode(kind: string): void {
  void paneCodeFor(kind)?.().catch(() => {});
}
