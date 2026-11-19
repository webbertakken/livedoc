// Which kinds the export draws a face of their own for (svg-render-faces.ts), so a reader of the export's labels knows
// one without the faces' drawings.

/** The Behaviour kinds svg-render-faces draws a face for, so the caller knows not
 *  to print the generic centred label over the top of one. */
export const BEHAVIOUR_FACE_SHAPES = new Set<string>([
  'mode-button',
  'session-button',
  'reveal',
  'picker',
  'reaction-pad',
  'comment-pin',
  'action-card',
  'portal',
  'chair',
  'desk',
  'sofa',
  'fence',
  // Avatar Pad (docs/specs/009-elements/avatar-pad.md).
  'avatar-pad',
  // The virtual office (docs/specs/009-elements/office.md).
  'room',
  'meeting-table',
  'plant',
  'bookshelf',
  'water-cooler',
  'coffee-machine',
  'rug',
  'focus-button',
]);
