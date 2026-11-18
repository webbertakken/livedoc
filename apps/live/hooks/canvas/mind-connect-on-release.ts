// A connector released between two mind nodes builds the tree (docs/specs/009-elements/mind-node.md "Connecting
// nodes"): the node connected to becomes the child of the node connected from, or the two swap places when one is
// the other's ancestor. Folded into the arrow drag's result, so the arrow and the new tree land as one change. The
// tree's code is the mind maps family's: a board where it is not in draws no mind node to connect to.
import type { ArrowElement, Element } from '@livedoc/document';
import { debugLog } from '@/lib/debug-log';
import { dressMindConnector } from '@/lib/mind-dress';
import { isKindFamilyLoaded, requireKindFamily } from '@/lib/element-kinds/store';

// `committed` is the tab before the drag: for a moved end, the pair the connector joined until now.
export function mindConnectionOnRelease(
  committed: readonly Element[],
  arrowId: string,
  reposition: boolean,
): (elements: Element[]) => Element[] {
  const previous = reposition
    ? committed.find((el): el is ArrowElement => el.id === arrowId && el.type === 'arrow')
    : undefined;
  return (elements) => {
    if (!isKindFamilyLoaded('mind-maps')) return elements;
    const { connectMindNodes } = requireKindFamily('mind-maps');
    const next = connectMindNodes(elements, arrowId, previous, dressMindConnector);
    if (next !== elements) debugLog(`[mind-connect] arrow=${arrowId} reposition=${reposition}`);
    return next;
  };
}
