'use client';

// A start panel's mode switch (docs/specs/007-editor/start-diagramming.md "Changing mode"): the editor's own mode
// switch (ModeMenuChip), named, leading every start panel's rail, so a tab begun in the
// wrong mode can change before anything is made. The same rules as the top chrome's: nothing where the switch is not
// offered (a Plan tab among them). A change runs as a
// `start-mode` transition, which StartViewTransition cross-fades, never blinking the panel's content out.
import type { EditorMode } from '@livedoc/document';
import { useEditorModeState } from '@/components/chrome/editor-mode/editor-mode-context';
import { ModeMenuChip } from '@/components/chrome/editor-mode/ModeMenuChip';
import { startTypedTransition } from '@/lib/view-transition';
import { START_MODE_TRANSITION } from './StartViewTransition';
import type { TemplateStartMode } from './start-template-items';

// The start a mode opens on: Structured's is Start a Workshop with the Workshop control on; Plan has none here.
export function startModeFor(mode: EditorMode, workshop: boolean): TemplateStartMode | null {
  if (mode === 'plan') return null;
  return mode === 'diagram' && workshop ? 'workshop' : mode;
}

// `onSwitch` hears the start the new mode opens on, before the switch, so it can open that start too.
export function StartModeSwitch({
  onSwitch,
}: { onSwitch?: (start: TemplateStartMode) => void } = {}) {
  const editorMode = useEditorModeState();
  if (!editorMode?.canEdit || !editorMode.canSwitch) return null;
  return (
    <div data-start-mode-switch className="flex w-full shrink-0 sm:w-auto">
      <ModeMenuChip
        mode={editorMode.mode}
        onChange={(mode) => {
          const start = startModeFor(mode, editorMode.workshop);
          if (start) onSwitch?.(start);
          startTypedTransition(START_MODE_TRANSITION, () => editorMode.setMode(mode));
        }}
      />
    </div>
  );
}
