# Convert to Text

Handwriting drawn with a pen becomes typed words: **Convert to Text** reads the selected strokes and puts a text
element in their place, in a handwriting font, at the size they were written.

## Why

- People write on a tablet with a pen because it is quick, then want the words as text: searchable, editable,
  readable by others and by agents.
- Retyping what was just written is the slow step the pen was meant to save.

## Domain language

| Term                | Means                                                                          | Never called         |
| ------------------- | ------------------------------------------------------------------------------ | -------------------- |
| **ink**             | The selected pen strokes being converted                                       | drawing, scribble    |
| **Convert to Text** | The action that reads the ink and replaces it with a text element              | OCR, recognise, scan |
| **reader**          | What turns a picture of handwriting into words (the photo import's own reader) | OCR engine, model    |

## When it is offered

- On a selection made only of pen strokes (`freehand` elements, one or more), never a highlighter stroke, none of
  them locked or on a locked layer, on a tab whose edits are not blocked.
- To whoever may edit the tab (an Editor), as any other edit; a Participant or Viewer is not offered it.
- In every mode, where the strokes can be selected (Sketch's handwriting first among them).
- In three places, labelled **Convert to Text**: the selection's context menu (one stroke's menu and a
  multi-selection's), the multi-selection toolbar (a button with the text glyph), and the command palette.

## Reading

- The ink is drawn into one picture, dark strokes on white, scaled so its longer edge is at most 1024 px and its
  shorter at least 64 px, with a margin round it (`inkImage`).
  Stroke rotation is not applied: the points are read as they sit in their boxes.
- The picture goes to the photo import's reader ([Event storming](../021-event-storming/event-storming.md) Phase 9,
  `selectReader`): `POST /api/ai/read-notes` where a model is configured (`aiEnabled`), falling back to the
  in-browser reader when the hosted budget is spent; the in-browser reader alone where no model is configured.
  The same gating and the same budget failover as the photo import; only the picture of the ink is sent.
- While it reads, a toast says so ("Reading your handwriting…").

## The result

- One edit, one undo step: the strokes go and one **text element** takes their place, so a single Undo puts the
  ink back exactly as it was.
- The text is the reader's words, line breaks kept.
- It sits where the ink was: the ink's box is the text's box, on the first stroke's layer and at the first stroke's
  place in the stacking order.
- It is as big as the writing: its size (`textSize`, px) is the ink's height over its line count, times 0.75,
  whole pixels, between 12 and 160.
- It is written in **Caveat**, the handwriting font ([Fonts](../004-interface-design/fonts.md)), left-aligned, in
  the ink's colour (the first stroke's pen colour, or its custom colour).
- The text element is selected afterwards, so it can be edited, moved or styled at once.
- The strokes are checked again before the edit: if any was removed, locked or moved onto a locked layer while the
  reader was busy, nothing changes and a toast says the handwriting changed while it was being read.

## When reading fails

Nothing changes on the canvas, and a toast says why in plain words:

- The reader found no words: "No words could be read in that handwriting."
- The reader could not answer (offline, out of budget with no device reader, a model error): "The handwriting
  could not be read just now. Try again in a moment." The reader's own token is logged.

## Telemetry

- `AI·Used·InkToText` when a conversion lands, as the photo import counts `AI·Used·PhotoNotes`.
- `Error·Warning·InkToText` when reading fails or finds nothing.

## Code

- The pure parts (which strokes are ink, their box, the picture's polylines, the text element, the edit):
  `apps/live/lib/ink-to-text/ink-to-text.ts`; the picture: `apps/live/lib/ink-to-text/ink-image.ts`.
- The action, its gating, reading and toasts: `apps/live/hooks/canvas/useInkToText.ts`.

## Testing

- The pure parts, each rule above (`ink-to-text.test.ts`); the hook with the reader mocked: a conversion lands as
  one commit, a failure or an empty read changes nothing and says so (`useInkToText.test.tsx`).
- The menu row, the toolbar button and the palette command appear only where the action is offered.
