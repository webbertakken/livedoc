// Which tabs' empty-tab cards this browser has closed (docs/specs/007-editor/new-document-route.md "The empty-canvas
// hint"): a closed card never shows again on that tab, for this person on this device.
import { createRememberedKeys } from './remembered-keys';

export const EMPTY_CARD_DISMISSED_KEY = 'livedoc:v2:empty-card-dismissed';
export const EMPTY_CARD_DISMISSED_MAX = 200;

const closed = createRememberedKeys(EMPTY_CARD_DISMISSED_KEY, EMPTY_CARD_DISMISSED_MAX);

export const emptyCardDismissed = closed.has;
export const dismissEmptyCard = closed.add;
