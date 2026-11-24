'use client';

// The Screenshot field (docs/specs/016-platform/bug-reports.md "The form" item 3): Capture Screen and Upload Image,
// the privacy note, the preview of what will be sent with Remove Screenshot, and its errors and announcements. Paste and
// drop are the form's (BugReportDialog), feeding the same `attachFile`.
import { useRef } from 'react';
import { Button } from '@livedoc/ui';
import { ACCEPTED_SCREENSHOT_TYPES } from '@/lib/bug-report/screenshot';
import { BUG_REPORT_COPY as COPY } from './bug-report-copy';
import type { BugReportScreenshotState } from './useBugReportScreenshot';

export function BugReportScreenshotField({ shot }: { shot: BugReportScreenshotState }) {
  const captureRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const remove = () => {
    shot.remove();
    captureRef.current?.focus();
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-body text-slate-700 dark:text-slate-200">
        {COPY.screenshotLabel}{' '}
        <span className="font-normal text-slate-500 dark:text-slate-400">{COPY.optional}</span>
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          ref={captureRef}
          variant="secondary"
          size="sm"
          // Stays focusable while a capture runs; a press then does nothing.
          aria-disabled={shot.capturing}
          onClick={() => {
            if (!shot.capturing) shot.capture();
          }}
        >
          {shot.capturing ? COPY.capturing : COPY.capture}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-disabled={shot.capturing}
          onClick={() => {
            if (!shot.capturing) fileRef.current?.click();
          }}
        >
          {COPY.upload}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_SCREENSHOT_TYPES.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) shot.attachFile(file);
            e.target.value = '';
          }}
        />
      </div>
      <p className="text-supporting text-slate-500 dark:text-slate-400">{COPY.pasteHint}</p>
      <p className="text-supporting text-slate-500 dark:text-slate-400">{COPY.screenshotNote}</p>
      {shot.prepared ? (
        <figure className="flex items-start gap-3">
          <img
            src={shot.prepared.previewUrl}
            alt={COPY.screenshotPreview}
            className="max-h-48 w-auto max-w-[70%] rounded-control border border-slate-200 object-contain dark:border-slate-700"
          />
          <figcaption className="flex flex-col items-start gap-2 text-supporting text-slate-600 dark:text-slate-300">
            {COPY.screenshotPreview}
            <Button variant="secondary" size="xs" onClick={remove}>
              {COPY.removeScreenshot}
            </Button>
          </figcaption>
        </figure>
      ) : null}
      {shot.error ? (
        <p role="alert" className="text-body text-rose-700 dark:text-rose-300">
          {shot.error}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {shot.announcement}
      </p>
    </fieldset>
  );
}
