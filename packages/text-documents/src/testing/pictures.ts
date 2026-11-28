// Pictures for the text documents' tests, of one colour each (`solidPng`, the office packages'). Test-only.
import { solidPng } from '@livedoc/office-packages/testing';

export { solidPng };

/** A green picture of 130 × 92 pixels: 97.5 × 69 pt at 96 an inch. */
export const GREEN_PNG = solidPng(130, 92, [0x6a, 0xa8, 0x4f]);
/** Its media's name, the SHA-256 of its bytes (proven in pictures-files.test.ts). */
export const GREEN_PNG_SHA = '81a78c276d8d4fdbeda7b323f4a367e5c47d8f08fef76dc91a7f250432bdd794';

/** A blue picture of 40 × 40 pixels. */
export const BLUE_PNG = solidPng(40, 40, [0x3d, 0x85, 0xc6]);
export const BLUE_PNG_SHA = 'd75ad63062ac9dec8d36fbd1f1019962920af65945931704836efb1d782c2299';
