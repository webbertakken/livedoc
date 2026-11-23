// What a PDF document reads of the device it is on (docs/specs/035-pdf-documents/opening.md "Limits";
// reading-surface.md "Phone and tablet"): a phone is a device that says it has little memory, or says nothing and is
// touched, not pointed at. A phone's engine, tiles and pixel ratio are held to the phone's budgets.
import {
  PDF_PHONE_MAX_DEVICE_GB,
  PDF_PHONE_PIXEL_RATIO,
  PDF_TILE_CACHE_BYTES,
  PDF_TILE_PHONE_CACHE_BYTES,
} from '@livedoc/pdf-documents';

export type PdfDevice = { deviceMemory: number | undefined; coarsePointer: boolean };

export const PdfDevice = {
  /** This browser's device. */
  current: (): PdfDevice => ({
    deviceMemory: (navigator as { deviceMemory?: number }).deviceMemory,
    // A browser without media queries (a test's) is pointed at.
    coarsePointer: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
  }),

  isPhone: (device: PdfDevice): boolean =>
    device.deviceMemory === undefined
      ? device.coarsePointer
      : device.deviceMemory <= PDF_PHONE_MAX_DEVICE_GB,

  /** The bytes of tiles a surface keeps. */
  tileBudget: (device: PdfDevice): number =>
    PdfDevice.isPhone(device) ? PDF_TILE_PHONE_CACHE_BYTES : PDF_TILE_CACHE_BYTES,

  /** Device pixels a CSS pixel tiles are drawn at: the screen's, at most PDF_PHONE_PIXEL_RATIO on a phone. */
  tilePixelRatio: (device: PdfDevice, screenRatio: number): number =>
    PdfDevice.isPhone(device) ? Math.min(screenRatio, PDF_PHONE_PIXEL_RATIO) : screenRatio,
} as const;
