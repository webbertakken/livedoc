// The New Document wizard's mode choice opens its blank's start (docs/specs/007-editor/start-diagramming.md "When it
// shows"). Apart from start-shown.ts, as it reads the template catalogue.
import { isBlankTemplate, templateOpening, type TemplateKind } from '@livedoc/templates';
import { showStart, startKey } from './start-shown';

/**
 * The wizard's mode choice asked for templates next, so the blank it makes opens on its start. Plan has no start to
 * open (Start Planning always shows); a template is not empty. True when a start was opened.
 */
export function openStartForModeChoice(tabId: string, kind: TemplateKind | null): boolean {
  if (!kind || !isBlankTemplate(kind)) return false;
  const mode = templateOpening(kind);
  if (mode === 'plan') return false;
  showStart(startKey(tabId, mode));
  return true;
}
