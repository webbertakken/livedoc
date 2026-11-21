# Objects

**Status: specified.** Nothing is built.

The pieces of a PDF page's content other than its text: **pictures**, **shapes** and **links**, changed in Editing
([Editing modes](editing-modes.md)). An **object** here is page content, what the author drew; a
[mark](marks.md) sits on top of the page and is Reviewing's. Text is [Editing text](editing-text.md). The research is
[Editing text in place](../../research/pdf-documents/editing-text.md) and
[The engine](../../research/pdf-documents/engine.md).

## Selecting

- The **Object tool** (O) selects pictures and shapes; in Editing the Select tool selects them too, and text boxes.
- A press selects the topmost object under the pointer; ⌥ with a press cycles to the ones beneath; a drag from empty
  space selects every object it touches; ⇧ adds.
- A selected object shows its bounds, eight handles and a rotate handle; its size and place show in the side panel in
  the page's own units.
- **What is one object** is the file's own: a picture is one; a shape is one path, or a group of paths the file drew
  together (a form object), entered by a double press.
- Objects the engine reads and LiveDoc does not change (shadings, patterns as fills, clipping paths, inline
  pictures) are selected and moved as wholes, never taken apart.

## Pictures

| Action               | Does                                                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Add**              | Insert > Picture, a drop or a paste, in Editing: PNG, JPEG, GIF (first frame), WebP, AVIF, SVG (drawn as a picture); placed at its natural size, at most the page's margins                              |
| **Replace**          | Another picture in the same place and bounds                                                                                                                                                             |
| **Move, resize**     | By dragging and by handles; ⇧ frees the proportions, kept by default                                                                                                                                     |
| **Rotate**           | By the handle, snapping at 15°; 90° steps from the menu                                                                                                                                                  |
| **Flip**             | Horizontally, vertically                                                                                                                                                                                 |
| **Crop**             | Handles that cut the picture's visible area; the hidden part stays in the file until **Remove hidden information** ([Redaction and protection](redaction-and-protection.md#removing-hidden-information)) |
| **Alternative text** | A description, asked when a picture is added and editable after; written as the figure's alternative text in a tagged file                                                                               |
| **Save picture**     | Saves the picture as the file holds it                                                                                                                                                                   |
| **Delete**           | Removes it from the page                                                                                                                                                                                 |

- **A picture is kept as it came**: a JPEG stays a JPEG, never re-encoded by moving, resizing, rotating or cropping,
  which change only how it is placed. A picture added is stored in its own encoding where the format allows one
  (JPEG as is; others losslessly), with its colour profile.
- A picture added is a blob named in the change ([Live editing and storage](live-editing-and-storage.md#storage)),
  capped at `PDF_PICTURE_MAX_BYTES`; a larger one is scaled down on request, never silently.
- Editing a picture in another program is left out; **Replace** takes the result.
- A scanned page's one picture is the page: it is not offered as an object while [Scans](scans.md) names the page a
  scanned page, so it is not dragged away by mistake; **Edit as a picture** on the page's menu offers it.

## Shapes

- **Move, resize, rotate, flip, delete**, as pictures.
- **Restyle**: stroke colour and fill colour from the one
  [colour picker](../004-interface-design/colour-picker.md), stroke width, dash, opacity. A fill that is a shading or
  a pattern is shown as "Gradient" or "Pattern" and replaced only by a plain colour, asked first.
- **Add**: Insert > Shape in Editing draws a line, rectangle, ellipse or polygon into the page content (not a mark):
  it is the page's from then on.
- Editing a path's own points is not offered `(default)`: a shape is changed as a whole.

## Arranging

For any selection of text boxes, pictures and shapes on one page:

- **Order**: bring to front, bring forward, send backward, send to back, within the page's content. Marks always
  draw above page content, as the format has it.
- **Align**: left, centre, right, top, middle, bottom, to the selection or to the page.
- **Distribute**: horizontally, vertically, when three or more are selected.
- **Match size**: width, height, both.
- **Group** is not offered for page content `(default)`: a form object the file made is the only group.
- Smart guides show alignment with other objects and the page's centre and margins while dragging; ⌘ held turns them
  off.
- **Copy, cut, paste, duplicate** within and across pages and PDF documents.

## Links

A link is a rectangle on a page that goes somewhere. The file holds it among its annotations; LiveDoc treats it as
page furniture: followed in every mode, changed in Editing.

- **Add** (the Link tool, L, or Insert > Link): drag a rectangle, or select text first to link its lines. Then choose
  where it goes:

| Goes to                      | Set by                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| **A page view**              | Going to the page and zoom wanted, then **Set link**; stored as a destination                         |
| **A named place**            | Choosing one of the file's named destinations                                                         |
| **A web address**            | Typing it; only `http`, `https` and `mailto` are accepted ([Security](security.md#links-and-actions)) |
| **Another LiveDoc document** | Choosing it; written as its document address                                                          |

- **Look**: invisible (default) or a visible rectangle, with line colour, width (thin, medium, thick) and style
  (solid, dashed, underline); the highlight shown when pressed (none, invert, outline, inset) is kept as the file has
  it.
- **Edit**: in Editing a link shows its rectangle; it is moved and resized by its handles, and its target changed
  from its menu. **Remove link** deletes it. **Remove all links** is in the Edit menu, asked first.
- **Create links from addresses**: finds text on the pages that reads as a web address and offers to link each,
  listed before any is made.
- A link to a file on a disk, or one that runs an action, is kept untouched and never followed; in Editing it reads
  "This link can't be followed here." and can be removed or retargeted.
- **Named destinations** are listed, added (from the view in front), renamed and deleted in the Outline panel's
  second tab, **Places** `(default)`.

## Together

- An object someone has selected is outlined in their colour with their name; two people may change one object at
  once, the later write winning per property (its place, its size, its style).
- An object's change is a live change naming the page and the object
  ([Live editing and storage](live-editing-and-storage.md#the-layout)); a new object has an id of its own.
- Deleting an object another person is moving ends their drag with "Ada deleted this."

## In the file

- Every change here but a link's is a **rewrite** of the page's content, guarded as text edits are: the page is drawn
  before and after, and pixels changed outside the object's old and new bounds undo the change
  ([Editing text](editing-text.md#guards)).
- A link is an annotation, and adding or changing one is written as an **addition**
  ([Saving](saving.md#addition-or-rewrite)); it is still an Editor's change, since it alters where the author's page
  leads.
- A file with certificate signatures is changed only after the warning of
  [Signing](signing.md#changes-after-a-signature).

## Limits

| Constant                     | Value      | Why                                                                                       |
| ---------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| `PDF_PICTURE_MAX_BYTES`      | 10,485,760 | `(default)` One added picture, the gallery's own cap                                      |
| `PDF_PAGE_MAX_OBJECTS_SHOWN` | 5,000      | `(default)` Past it a page's objects are selected by dragging only, not outlined on hover |
| `PDF_LINK_MAX_CHARS`         | 2,048      | An address ([Security](security.md#limits))                                               |

## Share roles

| Role            | Objects and links                                        |
| --------------- | -------------------------------------------------------- |
| **Editor**      | Everything here                                          |
| **Participant** | Follows links; saves a picture; changes nothing          |
| **Viewer**      | Follows links; saves a picture unless downloading is off |

## Keyboard and accessibility

- ⇥ reaches every object in reading order; arrow keys move one (⇧ by 10 points), ⌥ with arrows resizes, Delete
  removes; every arrange action is a menu item.
- A picture is announced with its alternative text, or "Picture, no description" with the action to add one; a link
  with its target.
- Handles are 24 px targets (44 on touch).

## Telemetry and observability

- `Pdf · Added · <Picture|Shape|Link>`, `Pdf · Changed · Object.<Moved|Resized|Rotated|Flipped|Cropped|Restyled|
Replaced|Arranged|Aligned>`, `Pdf · Deleted · <Picture|Shape|Link>`, `Pdf · Changed · AltText`. Never an address
  or a description.
- Fingerprints: `[pdf] object-edit page=<name> kind=<kind> guard=<ok|failed>`, `[pdf] picture-added bytes=<n>
type=<type>`, `[pdf] link-refused reason=<scheme|length>`.

## Errors

| When                       | A person sees                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| A picture cannot be read   | "That picture couldn't be read. Choose a PNG, JPEG, GIF, WebP, AVIF or SVG."             |
| A picture is too large     | "This picture is larger than 10 MB. Add it smaller?" **Scale down**                      |
| An address is not accepted | "Links can go to web addresses (http, https) and email addresses."                       |
| The guard fails            | "This page couldn't be changed without changing other parts of it." The change is undone |
