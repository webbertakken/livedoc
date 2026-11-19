// The kind families (docs/specs/016-platform/web-performance.md "An element kind's code loads with the board that
// holds it"): the units of element code that load on demand, one module each. The open path, the palette and the
// idle prefetch reach a family only through these loaders, so each family is one chunk however many places ask.

export const KIND_FAMILY_LOADERS = {
  'session-controls': () => import('./families/session-controls'),
  'collab-panels': () => import('./families/collab-panels'),
  'pages-articles': () => import('./families/pages-articles'),
  concepts: () => import('./families/concepts'),
  entities: () => import('./families/entities'),
  'web-components': () => import('./families/web-components'),
  'mind-maps': () => import('./families/mind-maps'),
  embeds: () => import('./families/embeds'),
  charts: () => import('./families/charts'),
  'event-storming': () => import('./families/event-storming'),
  sketches: () => import('./families/sketches'),
  wireframes: () => import('./families/wireframes'),
  'office-seating': () => import('./families/office-seating'),
  'avatar-mode': () => import('./families/avatar-mode'),
} as const;

export type KindFamilyId = keyof typeof KIND_FAMILY_LOADERS;

export type KindFamilyModule<F extends KindFamilyId> = Awaited<
  ReturnType<(typeof KIND_FAMILY_LOADERS)[F]>
>;

export const KIND_FAMILY_IDS = Object.keys(KIND_FAMILY_LOADERS) as readonly KindFamilyId[];
