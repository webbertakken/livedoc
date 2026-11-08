// What the New Document menu's pane lists for a blank (docs/specs/013-workspace/new-document-menu.md "The menu"): every
// template of the blank, in groups, blanks left out (a row of the list is the blank). A whole mode lists its start's
// groups, Recommended first, each template once, under the first group that holds it, leaving out the templates another
// blank lists from one of its groups (a template has one blank: Diagram leaves the mind maps to Brainstorm); a start's
// group lists that group;
// a Plan family lists its templates in the catalogue's order. Drawn from the starts and the catalogue, so a new template
// joins its blank's pane with no change here. Pure.
import {
  FORM_TEMPLATE_KINDS,
  NEW_DOCUMENT_BLANKS,
  PLAN_TEMPLATE_KINDS,
  isBlankTemplate,
  isSpreadsheetPlanTemplate,
  type NewDocumentBlank,
  type TemplateKind,
} from '@livedoc/templates';
import { TEMPLATE_STARTS } from '@/components/start/start-template-items';

export type PaneGroup = { id: string; name: string; kinds: readonly TemplateKind[] };

const PLAN_FAMILY_NAMES = {
  sheets: 'Sheet Templates',
  boards: 'Board Templates',
  forms: 'Form Templates',
};

function planFamily(family: 'sheets' | 'boards' | 'forms'): TemplateKind[] {
  if (family === 'forms') return [...FORM_TEMPLATE_KINDS];
  return PLAN_TEMPLATE_KINDS.filter((k) => isSpreadsheetPlanTemplate(k) === (family === 'sheets'));
}

// The groups of a start another blank lists on its own (Brainstorm's mind maps, Page's articles), so a whole mode's
// pane leaves their templates to that blank.
function groupsClaimedFrom(start: string, by: NewDocumentBlank): Set<string> {
  return new Set(
    NEW_DOCUMENT_BLANKS.flatMap((b) => {
      const s = b.templates;
      return b !== by && 'start' in s && s.start === start && s.group ? [s.group] : [];
    }),
  );
}

export function paneGroupsFor(blank: NewDocumentBlank): PaneGroup[] {
  const source = blank.templates;
  const listed = (kinds: readonly TemplateKind[], seen: Set<TemplateKind>) =>
    kinds.filter((k) => !isBlankTemplate(k) && !seen.has(k) && (seen.add(k), true));
  if ('plan' in source) {
    const kinds = listed(planFamily(source.plan), new Set());
    return [{ id: source.plan, name: PLAN_FAMILY_NAMES[source.plan], kinds }];
  }
  const groups = TEMPLATE_STARTS[source.start].groups;
  const chosen = source.group ? groups.filter((g) => g.id === source.group) : groups;
  // Pre-seen, so a claimed template is left out of every group, Recommended included.
  const claimed = groupsClaimedFrom(source.start, blank);
  const seen = new Set<TemplateKind>(
    source.group ? [] : groups.filter((g) => claimed.has(g.id)).flatMap((g) => g.kinds),
  );
  return chosen
    .map((g) => ({ id: g.id, name: g.name, kinds: listed(g.kinds, seen) }))
    .filter((g) => g.kinds.length > 0);
}
