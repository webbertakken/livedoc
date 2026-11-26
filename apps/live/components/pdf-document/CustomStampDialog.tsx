'use client';

// Create custom stamp (docs/specs/035-pdf-documents/custom-stamps.md "Making one"): the shell's dialog asking, in
// order, for a file (chosen or dropped), a PDF's page, a name and a category, with a preview of the picture as it
// will be kept; Create makes it, Cancel and Escape make nothing. What it decides is useCustomStampForm's.
import { useId, useMemo, useState, type DragEvent } from 'react';
import {
  PDF_CUSTOM_STAMP_CATEGORY_MAX_CHARS,
  PDF_CUSTOM_STAMP_NAME_MAX_CHARS,
} from '@livedoc/pdf-documents';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { browserPictureDrawing } from '@/lib/pdf-document/custom-stamp-drawing';
import type { PictureDrawing } from '@/lib/pdf-document/custom-stamp-picture';
import { startPdfEngineWorker } from '@/lib/pdf-document/pdf-engine-client';
import type { CustomStampDialogProps } from '@/lib/pdf-document/usePdfCustomStamps';
import { useCustomStampForm } from '@/lib/pdf-document/useCustomStampForm';

/** The files Create custom stamp takes, by their endings and their types; their bytes decide what each is. */
const ACCEPT = '.png,.jpg,.jpeg,.svg,.pdf,image/png,image/jpeg,image/svg+xml,application/pdf';

const FIELD =
  'h-field w-full min-w-0 rounded-control border border-(--office-line) bg-transparent px-2 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) pointer-coarse:h-11 pointer-coarse:text-base';

const LABEL = 'flex flex-col gap-1 text-supporting text-(--office-muted)';

export function CustomStampDialog({
  drawing,
  ...props
}: CustomStampDialogProps & { drawing?: PictureDrawing<unknown> }) {
  // Not drawn while closed: each opening begins with nothing chosen.
  return props.open ? <CustomStampForm {...props} drawing={drawing} /> : null;
}

function CustomStampForm({
  ownerId,
  categories,
  onClose,
  onMade,
  drawing,
}: CustomStampDialogProps & { drawing?: PictureDrawing<unknown> }) {
  const id = useId();
  const browser = useMemo(
    () => drawing ?? (browserPictureDrawing(startPdfEngineWorker) as PictureDrawing<unknown>),
    [drawing],
  );
  const form = useCustomStampForm({ ownerId, drawing: browser, onMade });
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void form.choose(file);
  };
  const pages = form.kept?.source === 'pdf' ? form.kept.pages : null;
  return (
    <OfficeDialog
      open
      onClose={onClose}
      title="Create custom stamp"
      primary={{
        label: form.making ? 'Creating…' : 'Create',
        onPress: () => void form.create(),
        disabled: !form.ready,
      }}
    >
      <div className="flex flex-col gap-4">
        <label
          data-custom-stamp-drop=""
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-control border border-dashed px-3 py-4 text-center text-body ${
            over ? 'border-(--office-focus) bg-(--office-pressed)' : 'border-(--office-line)'
          }`}
        >
          {form.preview ? (
            <img
              src={form.preview}
              alt="The stamp’s picture as it will be kept"
              className="max-h-32 max-w-full rounded-control bg-(--pdf-paper) object-contain"
            />
          ) : null}
          <span>
            {form.keeping
              ? 'Reading…'
              : form.fileName
                ? form.fileName
                : 'Choose or drop a PNG, JPEG, SVG or PDF'}
          </span>
          <input
            type="file"
            accept={ACCEPT}
            aria-label="Picture"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void form.choose(file);
              e.target.value = '';
            }}
          />
        </label>
        {pages !== null ? (
          <label className={LABEL}>
            {`Page (of ${pages})`}
            <input
              type="number"
              min={1}
              max={pages}
              value={form.page}
              onChange={(e) => form.choosePage(Number(e.target.value))}
              className={FIELD}
            />
          </label>
        ) : null}
        <label className={LABEL}>
          Name
          <input
            type="text"
            value={form.name}
            maxLength={PDF_CUSTOM_STAMP_NAME_MAX_CHARS}
            onChange={(e) => form.setName(e.target.value)}
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Category
          <input
            type="text"
            list={`${id}-categories`}
            value={form.category}
            maxLength={PDF_CUSTOM_STAMP_CATEGORY_MAX_CHARS}
            onChange={(e) => form.setCategory(e.target.value)}
            className={FIELD}
          />
          <datalist id={`${id}-categories`}>
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </label>
        {form.problem ? (
          <p role="alert" className="text-body text-(--office-error)">
            {form.problem}
          </p>
        ) : null}
      </div>
    </OfficeDialog>
  );
}
