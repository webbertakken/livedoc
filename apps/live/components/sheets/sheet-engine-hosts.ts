// The engines in the Web Worker (docs/specs/029-sheets/formulas.md "Recalculation"): one EngineHost for each scope the
// store works out apart (a spreadsheet's whole workbook, or one Plan tab), behind one Worker. Plan cards arrive as the
// page's items and types and are read here as the engine reads them. Pure, so a page without Workers runs it in place.
import { cardSourceOf, type Item, type ItemTypeDef } from '@livedoc/items';
import { EngineHost, type EngineIn, type EngineOut } from '@livedoc/sheets';

/** Plan cards as the page holds them: what the card functions read. */
export type CardData = {
  items: Item[];
  types: ItemTypeDef[];
  statusNames?: ReadonlyMap<string, string>;
};

export type ToEngine =
  | { scope: string; msg: EngineIn }
  | { scope: string; msg: { t: 'cards'; cards: CardData | null } }
  // The scope is no longer worked out (the document turned out a spreadsheet): its engine goes.
  | { scope: string; msg: { t: 'drop' } };

export type FromEngine = { scope: string; out: EngineOut };

export class EngineHosts {
  private readonly hosts = new Map<string, EngineHost>();
  private readonly post: (m: FromEngine) => void;
  private readonly clock: (() => number) | undefined;

  constructor(post: (m: FromEngine) => void, clock?: () => number) {
    this.post = post;
    this.clock = clock;
  }

  receive({ scope, msg }: ToEngine): void {
    if (msg.t === 'drop') {
      this.hosts.delete(scope);
      return;
    }
    let host = this.hosts.get(scope);
    if (!host) {
      host = new EngineHost((out) => this.post({ scope, out }), this.clock);
      this.hosts.set(scope, host);
    }
    if (msg.t === 'cards') {
      const { cards } = msg;
      host.setCards(
        cards
          ? cardSourceOf(cards.items, cards.types, {
              ...(cards.statusNames ? { statusNames: cards.statusNames } : {}),
              version: Date.now(),
            })
          : null,
      );
    } else host.receive(msg);
  }

  /** Work every scope's waiting cells for up to \`budgetMs\` in all; whether any still wait. */
  work(budgetMs: number): boolean {
    let more = false;
    for (const host of this.hosts.values()) if (host.work(budgetMs)) more = true;
    return more;
  }
}
