// A blank picked from another mode's search lands on its empty canvas (docs/specs/007-editor/start-diagramming.md
// "Found in other modes"): that mode's start is closed, whatever it was before. Plan's start cannot be closed.
import { isBlankTemplate, templateOpening, type TemplateKind } from '@livedoc/templates';
import { hideStart, startKey } from './start-shown';

export function closeStartForBlank(tabId: string, kind: TemplateKind | null): boolean {
  if (!kind || !isBlankTemplate(kind)) return false;
  const mode = templateOpening(kind);
  if (mode === 'plan') return false;
  hideStart(startKey(tabId, mode));
  return true;
}
