import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// docs/specs/035-pdf-documents/reading-surface.md "Phone and tablet": with reduced motion there is no animated scroll
// to a result or a page and no zoom easing. The surface moves the pages by setting where they scroll to, never by
// easing there, so it holds in every mode, reduced or not; the shell's own transitions stop under globals.css.

const FOLDERS = ['../components/pdf-document/', '../lib/pdf-document/'].map((folder) =>
  fileURLToPath(new URL(folder, import.meta.url)),
);

// A smooth scroll, an eased scroll or zoom, or a transition or animation of the PDF's own.
const MOTION =
  /behavior:\s*['"]smooth['"]|scroll-smooth|\btransition(?:-[a-z]+)?\b|\banimate-[a-z]|\.animate\(/;

describe('the PDF’s motion', () => {
  it('scrolls and zooms the pages in one step, with no easing of its own', () => {
    const offenders = FOLDERS.flatMap((folder) =>
      readdirSync(folder)
        .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
        .flatMap((file) =>
          readFileSync(folder + file, 'utf8')
            .split('\n')
            .map((line, at) => [`${file}:${at + 1}`, line] as const)
            .filter(([, line]) => MOTION.test(line))
            .map(([where]) => where),
        ),
    );
    expect(offenders).toEqual([]);
  });
});
