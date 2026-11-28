'use client';

import dynamic from 'next/dynamic';
import { useEditorContext } from '@/app/document/[id]/EditorContext';
import { PendingFormStart } from '@/components/forms/PendingFormStart';
import { TourHost } from './TourHost';
import { useEverTrue } from '@/hooks/ui/useEverTrue';

// The Plan tour (docs/specs/026-plan/plan-tour.md) loads the first time the person enters Plan, and stays
// mounted after, so leaving Plan mid-tour still runs its clean-up.
const PlanTourHost = dynamic(() => import('./PlanTourHost').then((m) => m.PlanTourHost), {
  ssr: false,
});
// The Workshop tour (docs/specs/012-collaboration/workshop-tour.md) loads the first time the person
// enters Workshop, and stays mounted after, as the Plan tour does.
const WorkshopTourHost = dynamic(
  () => import('./WorkshopTourHost').then((m) => m.WorkshopTourHost),
  { ssr: false },
);
// The Forms tour (docs/specs/030-forms/forms.md "The Forms tour"): loads the first time an Editor opens a Form tab.
const FormTourHost = dynamic(() => import('./FormTourHost').then((m) => m.FormTourHost), {
  ssr: false,
});
// The Draw tour (docs/specs/023-draw-mode/draw-tour.md): loads the first time the person enters Draw.
const DrawTourHost = dynamic(() => import('./DrawTourHost').then((m) => m.DrawTourHost), {
  ssr: false,
});
// Element tours (docs/specs/007-editor/element-tours.md): on the Start Tour button while an opted-in toured element
// kind is selected, so mounted with the editor; its chunk stays out of the first load.
const ElementTourHost = dynamic(() => import('./ElementTourHost').then((m) => m.ElementTourHost), {
  ssr: false,
});
// The Avatar tour (docs/specs/008-canvas/avatar-tour.md): loads the first time the person walks as an avatar.
const AvatarTourHost = dynamic(() => import('./AvatarTourHost').then((m) => m.AvatarTourHost), {
  ssr: false,
});
// The Pages tour (docs/specs/007-editor/pages-tour.md): loads the first time the person enters Pages.
const PagesTourHost = dynamic(() => import('./PagesTourHost').then((m) => m.PagesTourHost), {
  ssr: false,
});

// The editor's tours (docs/specs/007-editor/editor-tour.md), each mounted the first time its mode or kind is
// worked in and kept mounted after (each offers itself on the Start Tour button only while it could run), so leaving mid-tour still runs its clean-up.
export function EditorTours() {
  const { editorMode, activeTab, canvasTool } = useEditorContext();
  const mountPlanTour = useEverTrue(editorMode.mode === 'plan');
  const mountWorkshopTour = useEverTrue(editorMode.workshop);
  const mountDrawTour = useEverTrue(editorMode.mode === 'draw');
  const mountFormTour = useEverTrue(activeTab.kind === 'form');
  const mountAvatarTour = useEverTrue(canvasTool === 'avatar');
  const mountPagesTour = useEverTrue(editorMode.mode === 'pages');
  return (
    <>
      <TourHost />
      {/* The Plan tour (docs/specs/026-plan/plan-tour.md): on the Start Tour button once a board or Sheet is open. */}
      {mountPlanTour ? <PlanTourHost /> : null}
      {/* The Workshop tour (docs/specs/012-collaboration/workshop-tour.md): on the Start Tour button in Workshop. */}
      {mountWorkshopTour ? <WorkshopTourHost /> : null}
      {mountDrawTour ? <DrawTourHost /> : null}
      {/* The Forms tour (docs/specs/030-forms/forms.md "The Forms tour"): on the Start Tour button on a Form tab. */}
      {mountFormTour ? <FormTourHost /> : null}
      {/* A form template's form, started once its tab opens (lib/pending-form-start.ts). */}
      <PendingFormStart />
      {/* The Avatar tour (docs/specs/008-canvas/avatar-tour.md): on the Start Tour button while walking as an avatar. */}
      {mountAvatarTour ? <AvatarTourHost /> : null}
      {mountPagesTour ? <PagesTourHost /> : null}
      <ElementTourHost />
    </>
  );
}
