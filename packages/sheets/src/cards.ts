// Plan cards as formulas read them (docs/specs/029-sheets/formulas.md "Plan cards"). Structural, so the engine never
// imports the items package: the editor, the api and MCP build a CardSource from the document's items and types.
import type { Scalar } from './formula/values';

export type CardRow = { key: number };

export type CardSource = {
  // Every live card (not archived, not in the Trash), in key order.
  cards(): readonly CardRow[];
  // A field of a card by the name the card panel uses (case ignored): its value, or undefined when no such field.
  fieldOf(card: CardRow, name: string): Scalar | undefined;
  // Whether a field name is known at all (an unknown one is #NAME?).
  knowsField(name: string): boolean;
  // Raised whenever the cards change, so card readers recalculate.
  version: number;
  // Why the cards cannot be read at all (no cards' document chosen, or the reader may not open it): every card
  // function reads #REF! with it (plan-links.md "The `CARD` functions"). Absent for cards that read.
  unavailable?: string;
};

/** Why a spreadsheet's card functions read #REF!: it names no cards' document. */
export const CARDS_UNSET = "Choose the cards' document in Settings";
/** Why they read #REF!: the reader may not open the cards' document, or it is gone. */
export const CARDS_DENIED = "You don't have access to the cards' document";

/** Cards that cannot be read, for `why`: none listed, no field known, every card function #REF!. */
export function unavailableCards(why: string): CardSource {
  return {
    cards: () => [],
    fieldOf: () => undefined,
    knowsField: () => false,
    version: 0,
    unavailable: why,
  };
}
