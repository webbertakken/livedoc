import type { PaletteTileDef } from '@/components/palette/palette-tile-defs';
import { debugLog } from '@/lib/debug-log';
import type { KindFamilyId } from './families';
import { kindFamilyOfShape } from './kind-family-of';
import { isKindFamilyLoaded, loadKindFamily } from './store';

// The palette's side of the families (docs/specs/016-platform/web-performance.md "From the palette"): pointing at or
// focusing a tile fetches the family of what it places, and a press places once that family is in, so an element is
// never placed without its face.

type TileAction = PaletteTileDef['action'];

const WEB_COMPONENT_KINDS = new Set(['banner', 'hero', 'header', 'callout', 'stat', 'process']);

export function kindFamilyOfTile(action: TileAction): KindFamilyId | null {
  switch (action.type) {
    case 'shape':
      return kindFamilyOfShape(action.kind);
    case 'video':
    case 'link-card':
      return 'embeds';
    case 'component':
      return WEB_COMPONENT_KINDS.has(action.kind) ? 'web-components' : null;
    default:
      return null;
  }
}

export function prefetchTileKindFamily(action: TileAction): void {
  const family = kindFamilyOfTile(action);
  if (family) void loadKindFamily(family, 'palette');
}

// The tile's press, run at once when its family is in (or it has none), else once the family lands. A family that
// cannot load places nothing: the notice says part of the board could not load.
export function withKindFamily(action: TileAction, press: () => void): () => void {
  const family = kindFamilyOfTile(action);
  if (!family) return press;
  return () => {
    if (isKindFamilyLoaded(family)) {
      press();
      return;
    }
    debugLog(`[element-kinds] press waits family=${family}`);
    void loadKindFamily(family, 'palette').then((ok) => {
      if (ok) press();
    });
  };
}
