// The collaboration panels family (docs/specs/016-platform/web-performance.md): the room-response
// panels, comment pins and action cards, and the panels' verbs (hooks/canvas/collab-panel-verbs.ts). Loaded through the
// registry (lib/element-kinds), never imported statically.
export { CollabFaceRouter } from '@/components/canvas/collab/CollabFaceRouter';
export { CommentPanelFace } from '@/components/canvas/CommentPanelFace';
export { ActionPanelFace } from '@/components/canvas/ActionPanelFace';
export { collabPanelVerbs } from '@/hooks/canvas/collab-panel-verbs';
export { quizVerbs } from '@/hooks/canvas/quiz-verbs';
