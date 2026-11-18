# Element kinds on demand

Derived from [Web performance](../web-performance.md) "An element kind's code loads with the board that holds it".
This blueprint holds what is built; the spec holds why.

## Domain and naming

| Term            | Identifier                     | Meaning                                                                      |
| --------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| kind family     | `KindFamilyId`                 | The unit that loads on demand: kinds sharing code.                           |
| family module   | `KindFamilyModule<F>`          | What a family's loader resolves to: its faces (and, later, its model parts). |
| the registry    | `apps/live/lib/element-kinds/` | Names every family, its kinds and its loader. The only way in to a family.   |
| base            | `null` family                  | The plain diagram kinds; always in the first load.                           |
| a family is in  | `isKindFamilyLoaded(id)`       | Its module has resolved in this page.                                        |
| a family failed | `failedKindFamilies()`         | Its last needed load rejected; its elements draw nothing.                    |
| needed load     | `LoadReason` other than `idle` | A load something on screen or a press waits for.                             |
| the open's gate | `loadTabWithKindFamilies`      | A tab's content enters the editor only once its families are in (or failed). |
| face            | `familyFace(family, name)`     | A component of a family module, drawn synchronously once the family is in.   |

`LoadReason` is one of `open` (the early reads), `tab` (a tab's content entering the editor), `palette` (pointing,
focusing or pressing a tile), `element` (an element drawn before its family), `idle` (the prefetch), `retry` (the
notice's Retry or the connection coming back). Synonyms banned: "kind group", "bundle", "lazy kind".

### The families

Each row is one `KindFamilyId` and one module under `lib/element-kinds/families/`. Membership is by element,
`kindFamilyOf(element)`; everything not listed is base.

| `KindFamilyId`     | Elements                                                                                                                                                               | Faces                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session-controls` | shapes `mode-button`, `focus-button`, `session-button`, `reveal`, `picker`, `reaction-pad`, `portal`, `tab-window`                                                     | `ModeButtonFace`, `SessionTimerFace`, `SessionButtonFace`, `FocusButtonFace`, `RevealFace`, `PickerFace`, `ReactionPadFace`, `PortalFace`, `TabWindowFace` |
| `collab-panels`    | shapes `isCollabPanelShape` (`done-check`, `estimate`, `temperature`, `idea-box`, `qa-board`, `agenda`, `roll-call`, `decision`, `quiz`), `comment-pin`, `action-card` | `CollabFaceRouter`, `CommentPanelFace`, `ActionPanelFace`                                                                                                  |
| `pages-articles`   | shape `page`; an annotation with `articleNote`                                                                                                                         | `PageMasthead`, `ArticleNoteFace`                                                                                                                          |
| `concepts`         | shapes `isConceptShape` (`layer-stack`, `pyramid`, `cycle`, `hub`, `onion`, `chevrons`, `timeline-rail`)                                                               | `ConceptFace`                                                                                                                                              |
| `web-components`   | shapes `isWebComponentShape` (`banner`, `callout`, `card`, `stat-row`, `process`, `site-header`); an image with `heroCaption`                                          | `WebComponentFace`, `HeroCaptionCard`                                                                                                                      |
| `mind-maps`        | shape `mind-node`                                                                                                                                                      | `PersonNodeFace`                                                                                                                                           |
| `embeds`           | `video`, `link-card`                                                                                                                                                   | `VideoView`, `LinkCardView`                                                                                                                                |

The spec's other families (charts, Sankey and dashboards; office furniture and seating; wireframes; entities;
sketches; Event Storming) join the table as later slices move their code; until then their kinds are base.

## Behaviour and state

The registry holds one module-level store per page:

- `loaded: Map<KindFamilyId, module>`, `inFlight: Map<KindFamilyId, Promise<boolean>>`,
  `failed: Set<KindFamilyId>` (needed loads only), and listeners for `useSyncExternalStore`.
- **States of a family**: `absent` → `loading` → `in` | `failed`. `failed` → `loading` on any needed load (a retry).
  `in` is final for the page. An idle load that rejects returns to `absent`, never `failed`.
- **Invariant**: a family's module is read only from `loaded`; code reaches a face only through the registry.

### Transitions

1. **Early reads** (`lib/open-path/early-document-reads.ts`): when the open read carries the opened tab, or the early
   tab read answers, `loadKindFamiliesFor(elements, 'open')` starts every family the tab holds. Nothing waits on it.
2. **The open's gate** (`seed-fetched-document.ts`): the first tab's content (carried or read) is put in place
   only after `awaitKindFamiliesFor(tab.elements, 'tab')` settles. The same promise the early reads started is
   joined, never a second request.
3. **Another tab** (`usePerTabLoad`, the search sweep, `useRoomResync`): every tab read goes through
   `loadTabWithKindFamilies`, which awaits the families of the tab it returns.
4. **An element drawn before its family** (a peer's, a paste, a template, an undo): `BoxedElementView` draws nothing
   for it (`useKindFamilyReady(element)` false) and starts a needed load with reason `element`; it re-renders when
   the family is in.
5. **Palette**: a tile's pointer-enter or focus starts its family's load (`palette`). A press of a tile whose family
   is not in waits for it and then places; if the load fails, nothing is placed.
6. **Idle**: once the opened document has rendered (`loadingDocument` false), `prefetchWhenIdle(KIND_FAMILY_PREFETCH)`
   loads every family.
7. **Failure**: a needed load that rejects marks the family `failed`, hands the error to the stale-build safety net
   (`recoverInBrowser`), and the notice shows. Retry, or the browser's `online` event, reloads every failed family.

## Interfaces and contracts

```ts
// lib/element-kinds/families.ts
export type KindFamilyId = 'session-controls' | 'collab-panels' | 'pages-articles' | 'concepts' | 'web-components'
  | 'mind-maps' | 'embeds';
export const KIND_FAMILY_IDS: readonly KindFamilyId[];
export const KIND_FAMILY_LOADERS: { [F in KindFamilyId]: () => Promise<KindFamilyModule<F>> };
export type KindFamilyModule<F extends KindFamilyId>; // typeof import('./families/<F>')

// lib/element-kinds/kind-family-of.ts (pure; no model imports)
export function kindFamilyOf(element: Element): KindFamilyId | null;
export function kindFamiliesOf(elements: readonly Element[]): KindFamilyId[]; // unique, in first-seen order
export function kindFamilyOfShape(kind: string): KindFamilyId | null;

// lib/element-kinds/store.ts
export type LoadReason = 'open' | 'tab' | 'palette' | 'element' | 'idle' | 'retry';
export class KindFamilyNotLoaded extends Error { family: KindFamilyId }
export function loadKindFamily(id: KindFamilyId, reason: LoadReason): Promise<boolean>; // never rejects
export function isKindFamilyLoaded(id: KindFamilyId): boolean;
export function requireKindFamily<F extends KindFamilyId>(id: F): KindFamilyModule<F>; // throws KindFamilyNotLoaded
export function failedKindFamilies(): readonly KindFamilyId[];
export function retryFailedKindFamilies(): Promise<void>;
export function subscribeKindFamilies(listener: () => void): () => void;
export const KIND_FAMILY_PREFETCH: readonly (() => Promise<boolean>)[];
export function setKindFamilyFailureHandler(handler: (error: unknown, family: KindFamilyId) => void): void;
export function resetKindFamiliesForTests(): void;

// lib/element-kinds/load-for.ts
export function loadKindFamiliesFor(elements: readonly Element[], reason: LoadReason): Promise<void>; // never rejects

// lib/element-kinds/load-tab.ts
export function loadTabWithKindFamilies(...args: Parameters<typeof apiLoadTabRevisioned>): ReturnType<...>;

// lib/element-kinds/load-every-family.ts (tests that draw or place any kind, as after the idle prefetch)
export function loadEveryKindFamily(): Promise<void>;

// lib/element-kinds/useKindFamilies.ts (editor-page.tsx)
export function useKindFamilies(loadingDocument: boolean): void; // failure handler + idle prefetch

// lib/element-kinds/react.ts
export function useKindFamilyReady(element: Element): boolean; // asks with reason `element` while false
export function useFailedKindFamilies(): readonly KindFamilyId[];
export function familyFace<F extends KindFamilyId, K extends keyof KindFamilyModule<F>>(family: F, name: K):
  KindFamilyModule<F>[K];

// lib/element-kinds/tile-family.ts
export function kindFamilyOfTile(action: PaletteTileAction): KindFamilyId | null;
export function prefetchTileKindFamily(action: PaletteTileAction): void; // IconButton's `onIntent`
export function withKindFamily(action: PaletteTileAction, press: () => void): () => void; // in tileHandler
```

- `kindFamilyOf` accepts any value shaped like an element; an unknown `type` or `shape` is base (`null`).
- `requireKindFamily` on a family not in throws `KindFamilyNotLoaded` (`name` `'KindFamilyNotLoaded'`, message
  `Kind family <id> is not loaded`): reaching a face outside the gate is a bug a test catches.
- `kindFamilyOfTile`: `shape` by its kind, `video` and `link-card` to `embeds`, `component` kinds `banner`, `hero`,
  `header`, `callout`, `stat`, `process` to `web-components`; every other action is base.

## Data and persistence

Nothing is stored: the store is page memory; the document format is unchanged. A family's membership is derived
from fields already on the element (`type`, `shape`, `articleNote`, `heroCaption`).

## Errors and edge cases

- **A family's chunk fails while online, newer build live**: the safety net reloads into the newer build.
- **Offline, or the chunk fails for good**: its elements draw nothing; the notice shows; Retry or `online` retries.
- **The gate's load fails**: the tab still opens (the gate waits for settled, not for success); the notice shows.
- **A press on a tile whose load fails**: nothing is placed; the notice shows.
- **The same family asked by the early reads, the gate and an element at once**: one request (`inFlight`).
- **A tab with no family elements**: the gate resolves at once, no log line, no wait.
- **An unknown element type from a newer api**: base; drawn as it is today.
- **A thumbnail, export or Map picture**: drawn by the SVG renderer, which needs no family.

## Security and trust

No new trust boundary: family modules are this build's own chunks, fetched from the same origin. Element fields
read for membership are only compared against fixed strings.

## Performance and limits

- First load leaves the faces above: about 55 KiB (analyzer `cut` of the face modules, 58.8 KiB including the
  base faces that stay).
- The open adds no round trip: the early reads start the opened tab's families while the editor's code downloads,
  so the gate usually finds them in; at worst it waits one chunk fetch, in parallel with the editor's own.
- `useKindFamilyReady` subscribes only for an element with a family not yet in; base elements subscribe nothing.
- `kindFamiliesOf` is one pass over the tab's elements (O(n), no allocation per base element).

## Presentation and UX

- No placeholder for a face: the board appears with every face in its first frame.
- **The notice**, in the top-centre stack after the offline banner (`components/chrome/KindFamilyNotice.tsx`),
  shown while a needed load of a family has failed (`useFailedKindFamilies` non-empty): amber dot, text
  "Part of this board couldn’t load.", and a `Retry` text button. While retrying the button reads `Retrying…` and
  is disabled.

## Accessibility

- The notice's text is in a `role="status"` region; Retry is a native `button` with a visible focus ring
  (`focus-visible:ring-2`), contrast as the offline banner (WCAG 2.2 AA).
- No motion is added.

## Web Experience

- LCP: the board's first paint is not delayed beyond the slower of the tab read and its families' chunks, both
  started in parallel at the open.
- CLS: none; elements appear with their faces, never resized by a late face.
- INP: a palette press on a family already in places synchronously, as today.

## Observability

Every line goes through `debugLog` with the prefix `[element-kinds]`:

| Fingerprint                                                  | When                                      |
| ------------------------------------------------------------ | ----------------------------------------- |
| `[element-kinds] load family=<id> reason=<reason>`           | a load starts (not a joined one)          |
| `[element-kinds] in family=<id> ms=<n>`                      | a load resolves                           |
| `[element-kinds] failed family=<id> reason=<reason> <error>` | a load rejects (console.warn when needed) |
| `[element-kinds] gate families=<ids> ms=<n>`                 | the open's or a tab's gate settles        |
| `[element-kinds] press waits family=<id>`                    | a palette press waits for its family      |

## Testing

| Rule                                                       | Test                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| Membership matches the model's predicates                  | `lib/element-kinds/kind-family-of.test.ts` (every `SHAPE_KINDS`)   |
| States, one request, failure, retry, `KindFamilyNotLoaded` | `lib/element-kinds/store.test.ts`                                  |
| The gate waits for the tab's families                      | `lib/element-kinds/load-for.test.ts`, `seed-fetched-document` test |
| An element before its family draws nothing, then draws     | `lib/element-kinds/react.test.tsx`                                 |
| Tiles fetch on point and focus; a press waits              | `lib/element-kinds/tile-family.test.ts`, palette tile test         |
| The notice and its Retry                                   | `components/chrome/KindFamilyNotice.test.tsx`                      |
| Early reads start the opened tab's families                | `lib/open-path/early-document-reads.test.ts`                       |
| No face of a family is a static import                     | `app/document/[id]/document-lazy-load.test.ts` (reachability walk) |
| First frame holds every face; a palette insert             | `e2e/element-kinds-on-demand.spec.ts`                              |

## Constants and configuration

None new. Idle prefetch uses `prefetchWhenIdle`'s `IDLE_TIMEOUT_MS = 4000` and `FALLBACK_DELAY_MS = 1500`.

## Assets and external resources

None.

## Defaults ledger

See [DEFAULTS.md](DEFAULTS.md).
