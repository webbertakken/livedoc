'use client';

// A mark's Properties (docs/specs/035-pdf-documents/marks.md "Changing a mark": Properties): the side panel on the
// right, reading the one selected mark's kind, author, subject, dates and look; its subject a field, changed by Enter or
// by leaving it and put back by Escape; a boxed mark's Angle a field the same way, snapped to 15° (Rotate); and "Make
// this look the default" for its kind's tool.
import { useState } from 'react';
import { PDF_MARK_SUBJECT_MAX_CHARS, type Mark } from '@livedoc/pdf-documents';
import {
  OFFICE_PANEL_CONTROL,
  OFFICE_PANEL_START,
  OfficePanel,
} from '@/components/office/OfficePanel';
import {
  OFFICE_PANEL_WIDTH,
  clampPanelWidth,
  type OfficePanelSpec,
} from '@/lib/office/office-panels';
import { MARK_PROPERTIES } from '@/lib/pdf-document/pdf-menus';
import {
  angleShown,
  angleTyped,
  propertyRows,
  subjectShown,
  type PropertyRow,
} from '@/lib/pdf-document/pdf-mark-properties';
import type { PdfMarkProperties } from '@/lib/pdf-document/usePdfMarkProperties';

export const MARK_PROPERTIES_PANEL: OfficePanelSpec = {
  id: 'mark-properties',
  title: 'Properties',
  side: 'right',
  item: MARK_PROPERTIES,
};

/** The copy with no mark, or several, selected. */
export const NO_MARK_COPY = 'Select one mark to see its properties.';

function Rows({ rows }: { rows: readonly PropertyRow[] }) {
  return rows.map((row) => (
    <div key={row.label} className="grid grid-cols-[7rem_1fr] gap-2 px-2 py-1">
      <dt className="text-supporting text-(--office-muted)">{row.label}</dt>
      <dd className="text-body break-words text-(--office-ink)">{row.value}</dd>
    </div>
  ));
}

/** The subject's field: what is typed kept until Enter or leaving it; Escape puts it back. */
function SubjectField({ mark, onSubject }: { mark: Mark; onSubject: (typed: string) => void }) {
  const shown = subjectShown(mark);
  const [typed, setTyped] = useState(shown);
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-2 px-2 py-1">
      <dt>
        <label htmlFor={`subject-${mark.id}`} className="text-supporting text-(--office-muted)">
          Subject
        </label>
      </dt>
      <dd>
        <input
          id={`subject-${mark.id}`}
          {...{ [OFFICE_PANEL_START]: '' }}
          className={`${OFFICE_PANEL_CONTROL} w-full`}
          value={typed}
          maxLength={PDF_MARK_SUBJECT_MAX_CHARS}
          onChange={(event) => setTyped(event.target.value)}
          onBlur={() => onSubject(typed)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSubject(typed);
            } else if (event.key === 'Escape' && typed !== shown) {
              event.preventDefault();
              event.stopPropagation();
              setTyped(shown);
            }
          }}
        />
      </dd>
    </div>
  );
}

/** The Angle's field: whole degrees, taken to the nearest 15° by Enter or leaving it; Escape puts it back. */
function AngleField({
  mark,
  shown,
  onAngle,
}: {
  mark: Mark;
  shown: string;
  onAngle: (to: number) => void;
}) {
  const [typed, setTyped] = useState(shown);
  const take = () => {
    const to = angleTyped(typed);
    setTyped(to === null ? shown : String(to));
    if (to !== null && String(to) !== shown) onAngle(to);
  };
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-2 px-2 py-1">
      <dt>
        <label htmlFor={`angle-${mark.id}`} className="text-supporting text-(--office-muted)">
          Angle
        </label>
      </dt>
      <dd className="flex items-center gap-1">
        <input
          id={`angle-${mark.id}`}
          className={`${OFFICE_PANEL_CONTROL} w-20`}
          inputMode="numeric"
          aria-describedby={`angle-unit-${mark.id}`}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onBlur={take}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              take();
            } else if (event.key === 'Escape' && typed !== shown) {
              event.preventDefault();
              event.stopPropagation();
              setTyped(shown);
            }
          }}
        />
        <span id={`angle-unit-${mark.id}`} className="text-body text-(--office-muted)">
          degrees
        </span>
      </dd>
    </div>
  );
}

export function PdfMarkPropertiesPanel({ properties }: { properties: PdfMarkProperties }) {
  const [width, setWidth] = useState<number>(OFFICE_PANEL_WIDTH.initial);
  const { mark, makeDefault } = properties;
  const rows = mark ? propertyRows(mark) : null;
  const angle = mark ? angleShown(mark) : null;
  return (
    <OfficePanel
      spec={MARK_PROPERTIES_PANEL}
      width={width}
      onWidth={(next) => setWidth(clampPanelWidth(next))}
      onClose={properties.close}
      focusNonce={properties.focusNonce}
    >
      {mark && rows ? (
        <>
          <dl data-pdf-mark-properties={mark.id}>
            <Rows rows={rows.before} />
            {/* A new subject from anyone, or another mark, starts the field afresh. */}
            <SubjectField
              key={`${mark.id} ${subjectShown(mark)}`}
              mark={mark}
              onSubject={properties.setSubject}
            />
            <Rows rows={rows.after} />
            {mark && angle !== null ? (
              // A new angle from anyone, or another mark, starts the field afresh.
              <AngleField
                key={`${mark.id} ${angle}`}
                mark={mark}
                shown={angle}
                onAngle={properties.setAngle}
              />
            ) : null}
            <Rows rows={rows.last} />
          </dl>
          {makeDefault ? (
            <button
              type="button"
              onClick={makeDefault}
              className="mx-2 mt-3 h-field rounded-control border border-(--office-line) px-3 text-body text-(--office-ink) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
            >
              Make this look the default
            </button>
          ) : null}
        </>
      ) : (
        <p className="px-2 py-1 text-body text-(--office-muted)">{NO_MARK_COPY}</p>
      )}
    </OfficePanel>
  );
}
