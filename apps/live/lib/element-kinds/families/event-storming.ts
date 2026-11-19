// The Event Storming family (docs/specs/016-platform/web-performance.md): reading a photographed wall into a draft of
// notes (matching, placing, stitching several photos); suggestions, asks and the board's review, their faces
// (components/canvas/event-storming-faces.ts) and their verbs (hooks/canvas/*-verbs.ts, reached through
// useSuggestionActions, useChangeActions, useLaneActions, useAskActions and useReviewActions). Loaded with an Event
// Storming tab, and by a photo import before its photos go up (hooks/canvas/usePhotoDraft.ts); never imported
// statically.
export { boardNotesOfElements, stitchWall } from '@livedoc/document';
export { SuggestionLayer } from '@/components/canvas/suggestions/SuggestionLayer';
export { BoardOffers } from '@/components/canvas/suggestions/BoardOffers';
export { ReviewButton, ReviewCorner } from '@/components/canvas/review/ReviewButton';
export { ReviewRings } from '@/components/canvas/review/ReviewRings';
export { ReviewHost } from '@/components/canvas/review/ReviewHost';
export { AskHost } from '@/components/canvas/ask/AskHost';
export { suggestionPreview } from '@/lib/suggestion-apply';
export { offeredPreview } from '@/lib/change-preview';
export { suggestionVerbs } from '@/hooks/canvas/suggestion-verbs';
export { changeVerbs } from '@/hooks/canvas/change-verbs';
export { laneVerbs } from '@/hooks/canvas/lane-verbs';
export { askVerbs } from '@/hooks/canvas/ask-verbs';
export { reviewVerbs } from '@/hooks/canvas/review-verbs';
