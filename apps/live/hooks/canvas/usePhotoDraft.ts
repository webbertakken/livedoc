'use client';

import { useCallback, useRef, useState } from 'react';
import {
  acceptDraft,
  boardNotesOfElements,
  discardDraft,
  draftNotesOf,
  eventStormingNoteSize,
  stitchWall,
  unionRects,
  type Element,
  type PhotoAddition,
  type PhotoNote,
  type StickyElement,
  type Tab,
} from '@livedoc/document';
import { toNormalised, type DetectedSticky } from '@livedoc/sticky-vision';
import { selectReader } from '@/lib/reading/select';
import type { ReadOptions } from '@/lib/reading/types';
import { usePhotoReread } from './usePhotoReread';
import type { ModelDownload } from '@/lib/reading/download-progress';
import type { ProcessorReason, ReaderBackend } from '@/lib/reading/reader-protocol';
import type { ReaderFallback } from '@/lib/reading/types';
import { buildEventStormingNote } from '@/lib/draw-commit';
import { setPhotoDraftView } from '@/lib/photo-draft-preview';
import type { PhotoDetection } from '@/lib/photo-detect';
import { photoTypeError } from '@/lib/photo-accept';
import { detectorTelemetryType } from '@/lib/photo-model/telemetry';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { useLatest } from '@/hooks/ui/useLatest';

// A photo import, as ONE long gesture (docs/specs/021-event-storming/event-storming.md Phase 8, Phase 9).
//
//   idle → detecting → reading → review → draft → committing → idle
//                        ↘          ↘
//                    error (a toast; the entry points come back)
//
// The review is a THREE-STEP wizard (docs/specs/021-event-storming/event-storming.md Phase 9): the photo with every
// detected box (step 1), the words (step 2), then Add lands the ticked notes
// on the canvas as the draft (step 3). The review itself never touches the
// document — a checkpoint is armed only when Add lands, so the whole import is
// still one undoable step, and Discard restores the armed snapshot.

export type PhotoDraftStage =
  | 'idle'
  // Decoding the photo and finding the stickies in it, here in the browser.
  | 'detecting'
  // The wizard: photo + boxes immediately, then the words stream in behind
  // them (a SEPARATE stage, not a gate in front of the photo).
  | 'review'
  | 'draft'
  | 'committing';

export type PhotoDraftState = {
  stage: PhotoDraftStage;
  // How many stickies the detector found, for the progress line.
  found: number;
  // How many crops the reader has finished, for the progress bar.
  readSoFar: number;
  // The reading model's download, while an in-browser reader fetches it
  // (~180 MB, once per device). Absent for a reader with nothing to download.
  modelDownload?: ModelDownload;
  // Where an in-browser reader runs: the graphics card, or the processor.
  readerBackend?: ReaderBackend;
  // Why it runs on the processor, when it does.
  readerWhy?: ProcessorReason;
  // Set when the hosted reader's budget was spent and this device read instead.
  readerFallback?: ReaderFallback;
  // The last failure's token, for the toast. Cleared by the next attempt.
  error: string | null;
};

const EMPTY: PhotoDraftState = { stage: 'idle', found: 0, readSoFar: 0, error: null };

// What the review overlay shows and, on Add, lands. `detection` carries the
// photo (photoUrl), every detected box and the crops that were read; `textById`
// is the reader's answer keyed by box id. `readError` is set when the reader
// failed but the boxes are still worth showing blank.
export type PhotoReview = {
  // The photograph, shown the INSTANT it is picked — an object URL of the file
  // itself, so there is nothing to wait for. Everything else in this object
  // arrives later, behind it.
  photoUrl: string;
  // The file's own name. Only the ground-truth export uses it (a label file is
  // named after the photograph it describes); it is never shown and never sent.
  photoName: string;
  // Null while the detector is still looking. The overlay is already open and
  // showing the photo by then, which is the whole point: finding the stickies
  // in a 12-megapixel photo takes a moment, and a moment with no feedback is
  // indistinguishable from a broken button.
  detection: PhotoDetection | null;
  textById: Map<number, { text: string; legible: boolean }>;
  readError: string | null;
  // How many of this photo's crops have been read.
  readSoFar: number;
};

// Several photos of one wall, reviewed together (docs/specs/021-event-storming/event-storming.md Phase 11): one
// review per photo, in wall order, the one on screen, and what the picking left out. A single photo is a wall of one.
export type PhotoWall = {
  reviews: PhotoReview[];
  current: number;
  // Files that were not photos, and photos past the limit.
  skipped: number;
  leftOut: number;
};

// One photo's boxes as the author left them, and the words on each: what Add lands.
export type ReviewedPhoto = {
  kept: DetectedSticky[];
  texts: Map<number, { text: string; legible: boolean }>;
};

// The detector measured the geometry and the kind; the model read the words.
// Putting the two together is the only place they meet.
function toPhotoNotes(
  detection: PhotoDetection,
  textById: Map<number, { text: string; legible: boolean }>,
): PhotoNote[] {
  return detection.stickies.map((sticky: DetectedSticky) => ({
    id: sticky.id,
    // An unreadable crop still becomes a note: the PAPER was there, and an
    // empty note the author can type into beats a note that never arrived.
    text: textById.get(sticky.id)?.text ?? '',
    kind: sticky.kind,
    size: sticky.size,
    ...toNormalised(sticky, detection.imageSize),
    row: sticky.row,
    order: sticky.order,
  }));
}

type PhotoDraftDeps = {
  activeTab: Tab;
  activeId: string;
  ownerId: string;
  // Whether the api has a model configured. Decides WHO reads the handwriting:
  // the server model when there is one, the in-browser model when there is not
  // (docs/specs/021-event-storming/event-storming.md Phase 9). Never a gate on the import itself — both read.
  aiEnabled: boolean;
  createBlocked: boolean;
  // The gesture's three history verbs, exactly as the eraser and the drag use
  // them: arm one checkpoint, write through `tick`, and either leave the step
  // standing or cancel back to it.
  tick: (mapElements: (els: Element[]) => Element[]) => void;
  markCheckpoint: () => void;
  cancelToCheckpoint: () => void;
  setSelectedId: (id: string | null) => void;
  setMultiSelectedIds: (ids: Set<string>) => void;
  // Frame a rectangle of canvas (the viewport's own helper). The draft calls
  // it so what just arrived — and the notes it was matched against — are on
  // screen, rather than somewhere off to the right under a panel.
  fitToBounds: (
    bbox: { x: number; y: number; w: number; h: number },
    opts?: { maxZoom?: number },
  ) => void;
  toastError: (message: string) => void;
};

type PhotoDraftApi = {
  state: PhotoDraftState;
  // The review wizard's payload, set while `state.stage === 'review'`: the photo on screen.
  review: PhotoReview | null;
  // Every photo under review, when several were picked.
  wall: PhotoWall | null;
  // True while the review wizard is open (nothing landed yet).
  reviewOpen: boolean;
  // True while notes from a photo are awaiting Add or Discard. Derived from
  // the ELEMENTS, so a reload mid-draft still knows.
  draftOpen: boolean;
  startFromFile: (file: File) => Promise<void>;
  // Several photos of one wall, or zips of them, in file-name order (Phase 11). One photo goes the one-photo way.
  startFromFiles: (files: File[]) => Promise<void>;
  // Show another photo of the wall under review.
  goToPhoto: (index: number) => void;
  // Add every photo's boxes as they stand, stitched into one draft.
  confirmWall: (photos: ReviewedPhoto[]) => void;
  // Add the boxes AS THEY STAND in the review — ticked, corrected, drawn — as
  // the on-canvas draft.
  confirm: (kept: DetectedSticky[], texts: Map<number, { text: string; legible: boolean }>) => void;
  // Leave the review without adding anything.
  cancelReview: () => void;
  accept: () => void;
  discard: () => void;
  cancelReading: () => void;
  // Read these boxes again, from their rectangles as they stand now (a box
  // the author moved, resized or drew). Queued behind any read in flight.
  reread: (boxes: DetectedSticky[]) => void;
  // How many boxes are queued or being read again.
  rereading: number;
};

const ERROR_TOASTS: Record<string, string> = {
  crops_too_large: 'Those stickies came out too large to send. Try a smaller photo.',
  photo_unsupported_heic:
    'That looks like an iPhone HEIC photo. Save or export it as JPEG and try again.',
  photo_unsupported_type: 'That file is not a photo. Use a JPEG, PNG or WebP.',
  photo_unreadable: 'That photo could not be opened. Try another one.',
  photo_too_large: 'That photo is too large, even after resizing. Try a smaller one.',
  photo_invalid: 'That photo could not be read. Try another one.',
  ai_not_configured: 'Reading photos is not enabled on this deployment.',
  sign_in_required: 'Sign in to read a photo of your wall.',
  origin_not_allowed: 'Reading photos is not available from here.',
  rate_limited: 'Too many photos just now. Wait a moment and try again.',
  ai_quota: 'The model key is out of quota. Try later, or raise its limit.',
  ai_error: 'The reader could not finish. Try again in a moment.',
};

// Why a pick was refused. One per reason: "something is in the way" is not
// actionable, and the thing in the way is always on screen already.
const BUSY_TOASTS = {
  review: 'A photo is already open. Finish or cancel that one first.',
  draft: 'Finish the last photo’s notes first: Add or Discard them.',
  blocked: 'This board cannot take new notes right now.',
} as const;

const REREAD_FAILED_TOAST =
  'The changed notes could not be read again. Type their words in yourself.';

const NO_NOTES_TOAST =
  'No stickies found in this photo. Fill the frame with the wall, shoot straight on, and give it good light.';

export function usePhotoDraft(deps: PhotoDraftDeps): PhotoDraftApi {
  const [state, setState] = useState<PhotoDraftState>(EMPTY);
  const [wall, setWall] = useState<PhotoWall | null>(null);
  const review = wall ? (wall.reviews[wall.current] ?? null) : null;
  const wallRef = useLatest<PhotoWall | null>(wall);
  // Latest review, for guards inside callbacks whose deps do not re-run on it.
  const reviewRef = useLatest<PhotoReview | null>(review);
  const abortRef = useRef<AbortController | null>(null);
  // The object URL the overlay is showing. Held so it can be handed back to
  // the browser when the review closes: an unrevoked one pins the whole
  // photograph in memory for the life of the tab, and a wall photo is 3MB.
  const photoUrlRef = useRef<string[]>([]);
  // Which run is current. A run has two awaits before it is abortable, and
  // Cancel pressed in that window must not land a draft over a board the
  // author has moved on from.
  const runRef = useRef(0);
  // Whether this session armed the landing's checkpoint, so Discard knows it
  // has a step to cancel back to.
  const checkpointedRef = useRef(false);
  const live = useLatest(deps);
  // The photo as picked, kept for the review's life: a box the author moves
  // is cut again from it, at full resolution.
  const filesRef = useRef<File[]>([]);
  // Which photo a re-read belongs to: crop ids repeat from photo to photo.
  const rereadPhotoRef = useRef(0);
  // How far each photo's read has got, for the progress strip's total.
  const readByPhotoRef = useRef<number[]>([]);
  // How many photos the draft on the board came from, for the telemetry on Add.
  const draftPhotosRef = useRef(1);
  // One model, one queue: the first read and every re-read take turns.
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const enqueue = useCallback((job: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(job).catch((err) => {
      console.warn('[photo] a queued read failed', err);
    });
  }, []);

  const draftOpen = draftNotesOf(deps.activeTab.elements).length > 0;

  const fail = useCallback(
    (token: string) => {
      setState({ ...EMPTY, error: token });
      live.current.toastError(ERROR_TOASTS[token] ?? ERROR_TOASTS.ai_error!);
    },
    [live],
  );

  // Close the review and give the photograph back to the browser.
  const closeReview = useCallback(() => {
    for (const url of photoUrlRef.current) URL.revokeObjectURL(url);
    photoUrlRef.current = [];
    filesRef.current = [];
    readByPhotoRef.current = [];
    setWall(null);
  }, []);

  // Change the reviews that match, leaving the rest as they are.
  const patchReviews = useCallback(
    (match: (r: PhotoReview, index: number) => boolean, change: (r: PhotoReview) => PhotoReview) =>
      setWall((w) =>
        w ? { ...w, reviews: w.reviews.map((r, i) => (match(r, i) ? change(r) : r)) } : w,
      ),
    [],
  );

  // Hand the thread back long enough for the browser to paint what was just
  // set, before taking it again for work that will block. Two frames, because
  // one only guarantees the render has been COMMITTED, not that pixels reached
  // the screen. Falls back to a timeout where there are no frames (tests, and
  // a backgrounded tab, where rAF never fires at all).
  const nextPaint = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame !== 'function') {
          setTimeout(resolve, 0);
          return;
        }
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
    [],
  );

  // Fit a rectangle around the given elements, with a little margin: an import
  // that lands off-screen reads as an import that did nothing. Never zoomed in
  // past life size.
  const frameElements = useCallback(
    (els: readonly { x: number; y: number; width: number; height: number }[]) => {
      const b = unionRects(els);
      if (!b) return;
      const margin = 120;
      live.current.fitToBounds(
        {
          x: b.x - margin,
          y: b.y - margin,
          w: b.width + margin * 2,
          h: b.height + margin * 2,
        },
        { maxZoom: 1 },
      );
    },
    [live],
  );

  // The words arrive AFTER the review is already on screen: the crops are read
  // in the background and the text fields fill in batch by batch. A failure
  // leaves the fields blank and says why; the photo and boxes stay.
  // What any read tells the review besides the words: where it runs, why,
  // the model download, and a budget failover (docs/specs/021-event-storming/event-storming.md Phase 9).
  const readerCallbacks = useCallback((run: number): ReadOptions => {
    const current = () => runRef.current === run;
    return {
      onModelDownload: (modelDownload) => {
        if (!current()) return;
        setState((s) => (s.stage === 'review' ? { ...s, modelDownload } : s));
      },
      onBackend: (readerBackend, readerWhy) => {
        if (!current()) return;
        setState((s) => (s.stage === 'review' ? { ...s, readerBackend, readerWhy } : s));
      },
      // The hosted budget is spent: say so on the review, and warn the
      // error telemetry once, with closed values only (docs/specs/017-telemetry/telemetry.md).
      onFallback: (readerFallback) => {
        if (!current()) return;
        track('Error', 'Warning', 'AiQuota.BrowserReader');
        setState((s) => (s.stage === 'review' ? { ...s, readerFallback } : s));
      },
    };
  }, []);

  const readWords = useCallback(
    async (detection: PhotoDetection, controller: AbortController, run: number, photo = 0) => {
      const current = () => runRef.current === run;
      const mine = (r: PhotoReview) => r.detection === detection;
      // A wall reads its photos one after another under one controller: each read holds it while it runs.
      if (current()) abortRef.current = controller;
      try {
        const { read } = selectReader({
          aiEnabled: live.current.aiEnabled,
          ownerId: live.current.ownerId,
        });
        const answer = await read(detection.crops, {
          signal: controller.signal,
          onProgress: (readSoFar) => {
            if (!current()) return;
            readByPhotoRef.current[photo] = readSoFar;
            const total = readByPhotoRef.current.reduce((sum, n) => sum + (n ?? 0), 0);
            patchReviews(mine, (r) => ({ ...r, readSoFar }));
            setState((s) => (s.stage === 'review' ? { ...s, readSoFar: total } : s));
          },
          ...readerCallbacks(run),
          // Each note's words as they are read: the photo fills in note by
          // note, rather than a wall of blanks until the last one is done.
          onText: (cropId, read) => {
            if (!current()) return;
            patchReviews(mine, (r) => ({ ...r, textById: new Map(r.textById).set(cropId, read) }));
          },
        });
        if (!current()) return;
        patchReviews(mine, (prev) => ({
          ...prev,
          textById: answer.textById,
          // Part of the run is not all of it. The words that arrived are
          // shown; the note that says so names how many did not.
          // A reader that never started is its own failure, not part of a run.
          readError: !answer.failure
            ? prev.readError
            : answer.failure === 'reader_unavailable'
              ? 'reader_unavailable'
              : `partial:${answer.unread ?? 0}`,
        }));
        if (answer.failure === 'reader_unavailable') {
          live.current.toastError(
            `The reading model couldn't start in this browser (${answer.detail ?? 'unknown reason'}). Type the words in yourself, or try again later.`,
          );
        } else if (answer.failure) {
          live.current.toastError(
            `${answer.unread ?? 0} notes could not be read (${answer.failure}). Type those in yourself.`,
          );
        }
      } catch (err) {
        if (controller.signal.aborted || !current()) return;
        const token = err instanceof Error ? err.message : 'ai_error';
        patchReviews(mine, (r) => ({ ...r, readError: token }));
        live.current.toastError(ERROR_TOASTS[token] ?? ERROR_TOASTS.ai_error!);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [readerCallbacks, live, patchReviews],
  );

  // A box the author moved, resized or drew, read again (docs/specs/021-event-storming/event-storming.md Phase 9).
  const { rereading, reread, cancelRereads } = usePhotoReread({
    source: () => {
      const w = wallRef.current;
      const imageSize = w?.reviews[w.current]?.detection?.imageSize;
      const file = w ? filesRef.current[w.current] : undefined;
      if (w) rereadPhotoRef.current = w.current;
      return file && imageSize ? { run: runRef.current, file, imageSize } : null;
    },
    isCurrent: (run) => runRef.current === run,
    enqueue,
    reader: () =>
      selectReader({ aiEnabled: live.current.aiEnabled, ownerId: live.current.ownerId }).read,
    readOptions: readerCallbacks,
    onText: (run, id, read) => {
      if (runRef.current !== run) return;
      const photo = rereadPhotoRef.current;
      patchReviews(
        (_r, i) => i === photo,
        (r) => ({ ...r, textById: new Map(r.textById).set(id, read) }),
      );
    },
    onError: () => live.current.toastError(REREAD_FAILED_TOAST),
  });

  // Whether a new import may start at all. Every refusal SPEAKS: returning quietly is how picking a photo came to
  // look like a broken button, and the next move is to click again, which is refused just as quietly.
  const mayStart = useCallback((): boolean => {
    const d = live.current;
    // One draft at a time — a review in progress counts as one, even though nothing has landed yet.
    if (reviewRef.current !== null) {
      d.toastError(BUSY_TOASTS.review);
      return false;
    }
    if (draftNotesOf(d.activeTab.elements).length > 0) {
      d.toastError(BUSY_TOASTS.draft);
      return false;
    }
    if (d.createBlocked) {
      d.toastError(BUSY_TOASTS.blocked);
      return false;
    }
    return true;
  }, [reviewRef, live]);

  // The photos go up, then each is detected here in the browser, one after another, and read behind the review.
  // One photo is a wall of one: a photo that cannot be opened or holds no paper says so as it always has.
  const run = useCallback(
    async (files: File[], picked: { skipped: number; leftOut: number }) => {
      const single = files.length === 1;
      const runId = (runRef.current += 1);
      const current = () => runRef.current === runId;
      const controller = new AbortController();
      abortRef.current = controller;

      // THE PHOTOS GO UP FIRST. An object URL costs nothing to make and the browser decodes it for display on its
      // own thread, so the author sees the wall they just picked while the detector is still walking it.
      const urls = files.map((file) => URL.createObjectURL(file));
      photoUrlRef.current = urls;
      filesRef.current = files;
      readByPhotoRef.current = files.map(() => 0);
      setWall({
        reviews: files.map((file, i) => ({
          photoUrl: urls[i]!,
          photoName: file.name,
          detection: null,
          textById: new Map(),
          readError: null,
          readSoFar: 0,
        })),
        current: 0,
        ...picked,
      });
      setState({ stage: 'review', found: 0, readSoFar: 0, error: null });
      if (!single) debugLog('[photo] wall', { photos: files.length, ...picked });

      // Let the browser actually PAINT that before the detector takes the thread: detection is synchronous
      // number-crunching over a few million pixels.
      await nextPaint();
      if (!current()) return;

      // The detection pipeline (and the sticky detector in it) loads only now, once a photo is picked: most
      // documents never import one (docs/specs/016-platform/web-performance.md).
      let pipeline: typeof import('@/lib/photo-detect') | null = null;
      let found = 0;
      for (const [i, file] of files.entries()) {
        let detection: PhotoDetection;
        try {
          pipeline ??= await import('@/lib/photo-detect');
          detection = await pipeline.detectAndCrop(file, { signal: controller.signal });
        } catch (err) {
          if (!current()) return;
          const reason =
            pipeline && err instanceof pipeline.PhotoDetectFailed ? err.reason : 'photo_unreadable';
          if (single) {
            abortRef.current = null;
            closeReview();
            fail(reason);
            return;
          }
          // One unreadable photo of a wall does not lose the others: it is said on that photo.
          console.warn('[photo] wall photo unreadable', { photo: i, reason });
          patchReviews(
            (_r, at) => at === i,
            (r) => ({ ...r, readError: reason }),
          );
          continue;
        }
        if (!current()) return;
        track('AI', 'Used', detectorTelemetryType(detection.detector));
        found += detection.stickies.length;
        patchReviews(
          (_r, at) => at === i,
          (r) => ({ ...r, detection }),
        );
        setState((s) => ({ ...s, stage: 'review', found }));
        if (detection.stickies.length === 0) {
          // No paper in the picture. The photo STAYS on screen with the advice; never spend a model call on it.
          if (single) {
            abortRef.current = null;
            live.current.toastError(NO_NOTES_TOAST);
          }
          continue;
        }
        enqueue(() => readWords(detection, controller, runId, i));
        // Hand the thread back between photos, so the review stays responsive while the next one is walked.
        await nextPaint();
        if (!current()) return;
      }
    },
    [closeReview, enqueue, fail, nextPaint, readWords, patchReviews, live],
  );

  const startFromFile = useCallback(
    async (file: File) => {
      if (!mayStart()) return;
      // A file we cannot decode at all is refused before anything opens: an overlay showing a broken image is worse
      // than a straight answer.
      const typeError = photoTypeError(file.type);
      if (typeError) {
        fail(typeError);
        return;
      }
      await run([file], { skipped: 0, leftOut: 0 });
    },
    [mayStart, fail, run],
  );

  const startFromFiles = useCallback(
    async (files: File[]) => {
      const zip = files.some((f) => f.type === 'application/zip' || /\.zip$/i.test(f.name));
      if (files.length === 1 && !zip) return startFromFile(files[0]!);
      if (!mayStart()) return;
      const { wallPhotosOf } = await import('@/lib/photo-wall-files');
      const picked = await wallPhotosOf(files);
      if (picked.photos.length === 0) {
        fail('photo_unsupported_type');
        return;
      }
      await run(picked.photos, { skipped: picked.skipped, leftOut: picked.leftOut });
    },
    [mayStart, fail, run, startFromFile],
  );

  const goToPhoto = useCallback((index: number) => {
    setWall((w) =>
      w && index >= 0 && index < w.reviews.length && index !== w.current
        ? { ...w, current: index }
        : w,
    );
  }, []);

  // Add the ticked boxes as the on-canvas draft. The one write of the review: arm the checkpoint, stitch every
  // photo's notes against the board as it is NOW (a peer may have added the very note the photo shows), and land
  // them. Each photo's `kept` is every box that lands, as the author left it; `texts` the words on each.
  const confirmWall = useCallback(
    (photos: ReviewedPhoto[]) => {
      const d = live.current;
      const reviews = wallRef.current?.reviews ?? [];
      // Nothing to land before the detector has answered — the Add button is disabled then.
      if (!reviews.some((r) => r.detection)) return;
      const notes = reviews.map((r, i) =>
        r.detection && photos[i]
          ? toPhotoNotes({ ...r.detection, stickies: photos[i].kept }, photos[i].texts)
          : [],
      );
      if (notes.every((n) => n.length === 0)) return;
      const existing = boardNotesOfElements(d.activeTab.elements);
      const result = stitchWall(notes, existing);
      const read = reviews.reduce((sum, r) => sum + (r.detection?.stickies.length ?? 0), 0);
      // Nothing usable at all: close the review and say so. Photos whose notes are ALL already on the board are not
      // this case — they land nothing but still publish what they matched and how they differed.
      if (result.additions.length === 0 && result.matches.length === 0) {
        closeReview();
        setState(EMPTY);
        d.toastError(NO_NOTES_TOAST);
        return;
      }
      if (reviews.length > 1)
        debugLog('[photo] wall stitched', {
          photos: reviews.length,
          added: result.additions.length,
          seenAgain: result.seenAgain.length,
          placements: result.placements.map((pl) => pl.how),
        });
      const matchedIds = new Set(result.matches.map((m) => m.boardId));
      checkpointedRef.current = true;
      draftPhotosRef.current = reviews.length;
      d.markCheckpoint();
      const finalNotes = buildDraftNotes(result.additions, d.activeTab);
      d.tick((els) => [...els, ...finalNotes]);
      d.setSelectedId(null);
      d.setMultiSelectedIds(new Set(finalNotes.map((el) => el.id)));
      frameElements([...finalNotes, ...existing.filter((e) => matchedIds.has(e.id))]);
      const firstTexts = photos[0]?.texts;
      setPhotoDraftView({
        matchedIds,
        differences: new Map(
          result.differences
            .map((diff) => [diff.boardId, firstTexts?.get(diff.detectedId)?.text ?? ''] as const)
            .filter(([, text]) => text !== ''),
        ),
        read,
      });
      // The words on screen are what landed: a re-read still pending is moot.
      runRef.current += 1;
      cancelRereads();
      closeReview();
      setState({ stage: 'draft', found: read, readSoFar: read, error: null });
    },
    [wallRef, frameElements, cancelRereads, closeReview, live],
  );

  // One photo's Add.
  const confirm = useCallback(
    (kept: DetectedSticky[], texts: Map<number, { text: string; legible: boolean }>) =>
      confirmWall([{ kept, texts }]),
    [confirmWall],
  );

  const cancelReview = useCallback(() => {
    // Leaving the review also cancels the in-flight read, if it is still going.
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    cancelRereads();
    closeReview();
    setState(EMPTY);
  }, [closeReview, cancelRereads]);

  const accept = useCallback(() => {
    const d = live.current;
    const drafts = draftNotesOf(d.activeTab.elements);
    if (drafts.length === 0) return;
    setState((s) => ({ ...s, stage: 'committing' }));
    // The flag comes off; the notes stay exactly where the author left them.
    // The history step armed at landing is what Undo returns to, so the whole
    // import — the landing AND every correction — is one step.
    const after = acceptDraft(d.activeTab.elements);
    d.tick(() => after);
    track('AI', 'Used', 'PhotoNotes');
    if (draftPhotosRef.current > 1) track('AI', 'Used', 'PhotoWall');
    draftPhotosRef.current = 1;
    for (const _ of drafts) track('Element', 'Added', 'Sticky');
    checkpointedRef.current = false;
    setPhotoDraftView(null);
    setState(EMPTY);
  }, [live]);

  const discard = useCallback(() => {
    const d = live.current;
    if (draftNotesOf(d.activeTab.elements).length === 0) return;
    if (checkpointedRef.current) {
      // The ordinary cancel path: restore the armed snapshot and throw the
      // step away, so a discarded import leaves no trace in the undo stack.
      d.cancelToCheckpoint();
    } else {
      // A draft that outlived its session (a reload) has no checkpoint to go
      // back to, so it is removed as an ordinary edit instead.
      d.tick((els) => discardDraft(els));
    }
    checkpointedRef.current = false;
    setPhotoDraftView(null);
    setState(EMPTY);
  }, [live]);

  const cancelReading = useCallback(() => {
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    cancelRereads();
    setState(EMPTY);
  }, [cancelRereads]);

  return {
    state,
    review,
    wall,
    reviewOpen: review !== null,
    draftOpen,
    startFromFile,
    startFromFiles,
    goToPhoto,
    confirm,
    confirmWall,
    cancelReview,
    accept,
    discard,
    cancelReading,
    rereading,
    reread,
  };
}

// Every draft note is minted through the ONE builder, then takes the position
// the reconciliation worked out.
function buildDraftNotes(additions: PhotoAddition[], activeTab: Tab): StickyElement[] {
  return additions.map((addition) => {
    const size = eventStormingNoteSize(addition.kind);
    const note = buildEventStormingNote(
      addition.kind,
      addition.x + addition.width / 2,
      addition.y + addition.height / 2,
      activeTab,
    );
    const el: StickyElement = {
      ...note,
      label: addition.text,
      width: size.width,
      height: size.height,
      esDraft: true,
    };
    return el;
  });
}
