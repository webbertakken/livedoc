// Which features carry the work: AI, layers, the palette and canvas modes, look and feel, search, dialogs, chrome, notes, actions, organisation (docs/specs/017-telemetry/telemetry.md).
// Part of the metric catalogue: import from ../metric-catalogue.

import { isHelpArticleType, isSettingsCategory } from '../opened-types';
import { SELECTION_MODES } from '../palette-types';
import { CUSTOM_THEME_TYPES, NON_PATTERN_CANVAS_TYPES, isNonThemePick } from '../look-feel-types';
import type { Metric, MetricStack } from '../metric-series';
import { chart } from './helpers';
import { elementTourTokens } from '../element-tour-kinds';
import { LOGO_TOOL_TYPES } from '../logo-types';

export const LAYERS_RENAMED = chart(
  'Layer',
  'Renamed',
  'Layers Renamed',
  'A layer renamed by hand, or named automatically from the first labelled element put on it (smart naming).',
);

export const LAYERS_SELECTED = chart(
  'Layer',
  'Selected',
  'Layers Selected',
  'A layer made the active one.',
);

export const LAYERS_REORDERED = chart(
  'Layer',
  'Reordered',
  'Layers Reordered',
  'Layers dragged into a new order.',
);

export const FOLDERS_DELETED = chart(
  'Folder',
  'Deleted',
  'Folders Deleted',
  'A folder removed, in your Explorer or a team library.',
  { rising: 'neutral' },
);

export const FOLDERS_RENAMED = chart(
  'Folder',
  'Renamed',
  'Folders Renamed',
  'A folder renamed, in your Explorer or a team library.',
);

export const NOTES_DELETED = chart(
  'Note',
  'Deleted',
  'Notes Deleted',
  'A note cleared from an element.',
  { rising: 'neutral' },
);

export const ACTIONS_EDITED = chart(
  'Action',
  'Changed',
  'Actions Edited',
  'An assigned action edited or reassigned.',
);

export const ACTIONS_OPENED = chart(
  'Action',
  'Opened',
  'Actions Opened',
  'An element’s actions opened.',
);

export const ACTIONS_DELETED = chart(
  'Action',
  'Deleted',
  'Actions Deleted',
  'An assigned action removed.',
  { rising: 'neutral' },
);

// The long tail, found by metric-emitters.test's every-event check.
export const ACTIONS_MOVED_TO_TEAM = chart(
  'Action',
  'Moved',
  'Actions Moved to a Team',
  'An action’s document moved into a team so the assignee can reach it.',
);

export const ACTIONS_REOPENED = chart(
  'Action',
  'Unresolved',
  'Actions Reopened',
  'A completed action marked not done again.',
  { rising: 'neutral' },
);

export const LAYER_OPACITY = chart(
  'Layer',
  'Changed',
  'Layer Opacity',
  'A layer’s opacity changed.',
);

export const LAYERS_CLEARED = chart(
  'Layer',
  'Cleared',
  'Layers Cleared',
  'A layer emptied but kept.',
  { rising: 'neutral' },
);

export const LAYERS_MERGED = chart(
  'Layer',
  'Removed',
  'Layers Merged',
  'A layer merged into the one above or below.',
  { types: ['MergedDown', 'MergedUp'] },
);

export const NOTES_EDITED = chart('Note', 'Changed', 'Notes Edited', 'A written note changed.');

export const NOTE_FORMATTING = chart(
  'Note',
  'Used',
  'Note Formatting',
  'Rich-text formatting used inside a note.',
);

export const TABS_UNFILED = chart(
  'Tab',
  'Removed',
  'Tabs Unfiled',
  'A tab taken out of a tab folder.',
  { types: ['Folder'], rising: 'neutral' },
);

export const MODE_OPTIONS = chart(
  'UI',
  'Changed',
  'Mode Options',
  'Settings inside a canvas mode: eraser, laser, spotlight and format painter options.',
  { typeIn: (t) => /^(Eraser|Laser|Spotlight|Format)/.test(t ?? '') },
);

// AI assistance (Editing tab). Ask and Clean split AI Requests by mode. The
// photo import sends AI·Used too, under Photo* types, and has its own stack.
export const AI_REQUESTS: Metric = {
  category: 'AI',
  action: 'Used',
  typeIn: (type) => type === 'Ask' || type === 'Clean',
  title: 'AI Requests',
  blurb:
    'A completed request in the editor AI panel, across both modes (Ask, Clean). Refusals and failures are not counted.',
};

export const AI_ASK: Metric = {
  category: 'AI',
  action: 'Used',
  type: 'Ask',
  title: 'Ask Requests',
  blurb: 'AI requests in Ask mode: read-only questions about the diagram. Part of AI Requests.',
};

export const AI_CLEAN: Metric = {
  category: 'AI',
  action: 'Used',
  type: 'Clean',
  title: 'Clean Requests',
  blurb:
    'AI requests in Clean mode: tidy-the-tab runs, the one mode that changes the canvas. Part of AI Requests.',
};

export const AI_ASSISTANCE: MetricStack = {
  stack: true,
  title: 'AI Assistance',
  blurb: 'Requests in the editor AI panel, and how they split between Ask and Clean.',
  members: [AI_REQUESTS, AI_ASK, AI_CLEAN],
  headline: AI_REQUESTS,
};

// The photo import (event storming): a wall photo read into sticky notes.
// Each photo analysed sends which detector found its notes (the model, on
// WebGPU or WASM, or the classical fallback and why), and an import the
// author commits sends PhotoNotes. Two units, so the head counts imports.
export const PHOTOS_IMPORTED = chart(
  'AI',
  'Used',
  'Photos Imported',
  'A photo of a sticky-note wall turned into notes on the canvas, once the author confirmed the draft.',
  { types: ['PhotoNotes'] },
);

// A whole wall from several photos (docs/specs/021-event-storming/event-storming.md Phase 11): sent beside
// PhotoNotes when the confirmed draft came from more than one photo.
export const WALLS_IMPORTED = chart(
  'AI',
  'Used',
  'Walls Imported',
  'Several photos of one wall, stitched into one draft of notes, once the author confirmed it.',
  { types: ['PhotoWall'] },
);

export const MODEL_DETECTED = chart(
  'AI',
  'Used',
  'Model Detected',
  'A photo whose sticky notes the in-browser AI model found.',
  { typeIn: (type) => (type ?? '').startsWith('PhotoDetectHybrid') },
);

export const FELL_BACK_TO_CLASSICAL = chart(
  'AI',
  'Used',
  'Fell Back to Classical',
  "A photo read by the simpler fallback detector, because the in-browser AI model couldn't run on that device, failed, took too long, or the photo was too flat to read.",
  { typeIn: (type) => (type ?? '').startsWith('PhotoDetectClassical'), rising: 'bad' },
);

export const PHOTO_IMPORT: MetricStack = {
  stack: true,
  title: 'Photo Import',
  blurb:
    'Sticky-note walls photographed onto an event-storming board, and whether the in-browser model or the classical fallback read each photo.',
  members: [PHOTOS_IMPORTED, WALLS_IMPORTED, MODEL_DETECTED, FELL_BACK_TO_CLASSICAL],
  headline: PHOTOS_IMPORTED,
};

// Convert to Text (docs/specs/023-draw-mode/ink-to-text.md): pen strokes read into a text element by the photo
// import's reader, counted once the text lands.
export const HANDWRITING_CONVERTED = chart(
  'AI',
  'Used',
  'Handwriting Converted',
  'Selected pen strokes read into typed text with Convert to Text, once the text landed on the canvas.',
  { types: ['InkToText'] },
);

// Draw mode (docs/specs/023-draw-mode/draw-mode.md): Whiteboard tabs made, and which of the dock's
// choices people reach for. Headed by the boards made; the rest are settings.
export const WHITEBOARDS_CREATED = chart(
  'Draw',
  'Created',
  'Whiteboards Created',
  'A whiteboard tab made, from the New Document wizard or as a new tab.',
);

export const WHITEBOARD_PENS = chart(
  'Draw',
  'Selected',
  'Pens Picked',
  'A whiteboard pen picked up: the main, second or third pen.',
);

export const WHITEBOARD_SETTINGS = chart(
  'Draw',
  'Changed',
  'Pens, Eraser and Background',
  "A whiteboard pen's colour or width, the eraser mode or the board background changed.",
);

export const WHITEBOARD_RECOGNITION = chart(
  'Draw',
  'Toggled',
  'Shape Recognition',
  'Shape recognition switched on or off on a whiteboard.',
);

// Editor modes (docs/specs/007-editor/editor-modes.md): switches between the editor modes.
export const EDITOR_MODE_SWITCHES = chart(
  'Editor',
  'Changed',
  'Editor Mode Switches',
  'A tab switched to another editor mode (Sketch, Structured or Pages) by the person working on it.',
  { types: ['ModeDiagram', 'ModeDraw', 'ModePages', 'ModePlan', 'ModeWorkshop'] },
);

// The Workshop control (docs/specs/012-collaboration/workshop-mode.md "Telemetry"): the session kit turned on or off.
export const WORKSHOP_CONTROL_TURNED = chart(
  'Editor',
  'Toggled',
  'Workshop Control',
  'The Workshop control turned on or off for a tab, bringing or putting away the session kit.',
  { types: ['WorkshopOn', 'WorkshopOff'] },
);

// The mode a tab opens in, set from the tab menu's Opens in (docs/specs/007-editor/editor-modes.md).
export const TAB_OPENS_IN = chart(
  'Tab',
  'Changed',
  'Opening Modes Set',
  'A tab set to open in Diagram, Draw or Pages mode for everyone, from the tab menu.',
  { types: ['OpensInDiagram', 'OpensInDraw', 'OpensInPages', 'OpensInPlan'] },
);

// Pages mode's A4 page turned portrait or landscape (docs/specs/007-editor/editor-modes.md "The page").
export const PAGE_ORIENTATION = chart(
  'Tab',
  'Changed',
  'Page Orientations Set',
  "A Pages tab's A4 page turned to portrait or landscape, from the page's settings.",
  { types: ['PagePortrait', 'PageLandscape'] },
);

// Pages added after the last one, or deleted (docs/specs/007-editor/editor-modes.md "The pages").
export const PAGES = chart(
  'Tab',
  'Changed',
  'Pages Added and Deleted',
  'A page added to a Pages tab from the plus after its last page (an infographic page, a new article, or a slide), or deleted from its settings.',
  {
    types: [
      'PageAdded',
      'ArticleAdded',
      'SlidePageAdded',
      'PageRemoved',
      'ArticlesToPages',
      'PageKindInfographic',
      'PageKindArticle',
      'PageKindSlide',
      'LogoPageAdded',
      'PageKindLogo',
      'WireframePageAdded',
      'PageKindWireframe',
      'PageAddedLikeLast',
    ],
  },
);

// A wireframe page's device and frame chosen (docs/specs/007-editor/wireframe-pages.md).
export const WIREFRAME_DEVICES_CHOSEN = chart(
  'Tab',
  'Changed',
  'Wireframe Devices',
  'The device a wireframe page was framed as, chosen as it was added or afterwards, and its frame look.',
  {
    types: [
      'WireframeDeviceIphone',
      'WireframeDeviceIphoneDuo',
      'WireframeDeviceAndroid',
      'WireframeDeviceIpad',
      'WireframeDeviceAndroidTablet',
      'WireframeDeviceLaptop',
      'WireframeDeviceDesktop',
      'WireframeDeviceBrowser',
      'WireframeDeviceWatch',
      'WireframeFrameTheme',
      'WireframeFrameDark',
      'WireframeFrameLight',
      'WireframeFrameOutline',
    ],
  },
);

// A wireframe page's system bars turned on or off.
export const WIREFRAME_SYSTEM_BARS = chart(
  'UI',
  'Toggled',
  'Wireframe System Bars',
  'A wireframe page’s status bar and home indicator turned on or off.',
  { types: ['WireframeSystemBarsOn', 'WireframeSystemBarsOff'] },
);

// A logo page's tools (docs/specs/007-editor/logo-pages.md): shapes combined into one, Mirror
// Copy, and wordmark type set on a text.
export const LOGO_TOOLS = chart(
  'Element',
  'Changed',
  'Logo Tools Used',
  'On a logo page: shapes combined (Unite, Subtract, Intersect, Exclude), a Mirror Copy, and wordmark type (tracking, weight, case, arc) set on a text.',
  { types: [...LOGO_TOOL_TYPES] },
);

// Drawing with Mirror on: each drawing that got its reflected twin.
export const LOGO_MIRROR_TWINS = chart(
  'Element',
  'Created',
  'Mirrored Drawings',
  'A shape, path or stroke drawn on a logo page with Mirror While Drawing on, so it got a reflected twin.',
  { types: ['MirrorTwin'] },
);

// A logo page's own switches, each person's (Show Guides is a Setting, charted there).
export const LOGO_SWITCHES = chart(
  'UI',
  'Toggled',
  'Logo Mirror Switched',
  'Mirror While Drawing turned on or off on a logo page.',
  { types: ['LogoMirrorOn', 'LogoMirrorOff'] },
);

// How a logo page mirrors (docs/specs/007-editor/logo-pages.md "Mirror"): the axis, a radial
// mirror's copies and Merge Into One, from the Mirror popover.
export const LOGO_MIRROR_SETTINGS = chart(
  'UI',
  'Changed',
  'Logo Mirror Set Up',
  "A logo page's mirror axis, radial copies or Merge Into One changed in its Mirror popover.",
  {
    types: [
      'LogoMirrorAxisVertical',
      'LogoMirrorAxisHorizontal',
      'LogoMirrorAxisBoth',
      'LogoMirrorAxisRadial',
      'LogoMirrorCopies3',
      'LogoMirrorCopies4',
      'LogoMirrorCopies5',
      'LogoMirrorCopies6',
      'LogoMirrorCopies8',
      'LogoMirrorMergeOn',
      'LogoMirrorMergeOff',
    ],
  },
);

// A page's own settings (docs/specs/007-editor/pages-mode.md).
export const PAGE_SETUP = chart(
  'Tab',
  'Changed',
  'Pages Set Up',
  "A page's size, name, background or pattern changed from its panel (or a background given to every page of its kind, or painted from another page), or a page locked or unlocked.",
  {
    types: [
      'PageSize',
      'PageRenamed',
      'PageBackground',
      'PageBackgroundImage',
      'PageBackgroundAnimated',
      'PageBackgroundAnimatedSpeed',
      'PageBackgroundAppliedToAll',
      'PageBackgroundPainted',
      'PagePattern',
      'PageLocked',
      'PageUnlocked',
    ],
  },
);

// Contents (docs/specs/007-editor/pages-mode.md "Contents"): a press on a page in the list,
// going there, or a page dragged to a new place in it.
export const PAGE_CONTENTS_JUMPS = chart(
  'UI',
  'Used',
  'Contents Jumps and Reorders',
  "A page pressed in Pages mode's Contents list (the canvas gliding to it), or dragged to a new place there.",
  { types: ['PageContentsJump', 'PageContentsReorder'], rising: 'neutral' },
);

// The view rests on a page (docs/specs/007-editor/pages-mode.md "Getting around the pages"): a
// short pan or a flick from a page seen whole turning to its neighbour.
export const PAGE_SWIPES = chart(
  'UI',
  'Used',
  'Page Swipes',
  'A short pan or flick in Pages mode that turned the view to the next or previous page.',
  { types: ['PageSwipe'], rising: 'neutral' },
);

// Tab windows (docs/specs/009-elements/tab-window.md): a window's tab chosen, and the tab opened from it.
export const TAB_WINDOW_USE = chart(
  'UI',
  'Used',
  'Tab Windows Opened',
  'A tab opened from a Tab Window showing it, on a slide or page.',
  { types: ['TabWindowOpen'], rising: 'neutral' },
);

// Building pages: a layout placed, a page duplicated or moved.
export const PAGE_BUILDING = chart(
  'Tab',
  'Changed',
  'Pages Built',
  'A layout put onto a page, a page duplicated, moved or split, or a board put onto a page.',
  {
    types: [
      'PageLayout',
      'PageLayoutSurprise',
      'PageDuplicated',
      'PageMoved',
      'PagesLaidOut',
      'PageFitToContent',
    ],
  },
);

// Leaving Pages past the pages warning (docs/specs/007-editor/editor-modes.md "Leaving
// Pages"): how often people go on to Structured or Sketch once told their pages will not show.
export const LEAVE_PAGES_CONFIRMED = chart(
  'Editor',
  'Changed',
  'Pages Left Past the Warning',
  'Someone switched a Pages tab with pages to Structured or Sketch after the warning that its pages do not show there.',
  { types: ['LeavePagesConfirmed'] },
);

// An empty infographic page's in-page layout card hidden (docs/specs/007-editor/pages-mode.md
// "Layouts"): set beside Page Layout to see whether the card helps or gets in the way.
export const EMPTY_PAGE_LAYOUTS_HIDDEN = chart(
  'UI',
  'Closed',
  'Empty Page Layouts Hidden',
  'Someone hid the Start From a Layout card an empty page shows inside itself, or chose Start From Scratch on it.',
  { types: ['EmptyPageLayouts', 'EmptyPageLayoutsBlank'] },
);

// Writing articles (docs/specs/007-editor/article-pages.md "Telemetry").
export const ARTICLE_INSERTS = chart(
  'Element',
  'Added',
  'Article Inserts',
  'Something put into the writing of an article: an image, table, chart or drawing at the caret, an object or drawing taken in from the palette, or a divider, page break, quote or code block.',
  {
    types: [
      'ArticleImage',
      'ArticleTable',
      'ArticleChart',
      'ArticleCallout',
      'ArticleSticky',
      'ArticleDrawing',
      'ArticleObject',
      'ArticleDivider',
      'ArticlePageBreak',
      'ArticleQuote',
      'ArticleCode',
      'ArticleComment',
      'ArticleAction',
    ],
  },
);

export const ARTICLE_FORMATTING = chart(
  'Element',
  'Changed',
  'Article Formatting',
  "The page toolbar used on an article's writing (a format, a text style or list, a link) and a zone in the writing wrapped, placed or deleted.",
  {
    types: [
      'ArticleFormat',
      'ArticleBlockStyle',
      'ArticleLink',
      'ArticlePaste',
      'ArticleZoneWrap',
      'ArticleZoneResized',
      'ArticleZoneMoved',
      'ArticleZoneFloat',
      'ArticleZoneRemoved',
    ],
  },
);

export const ARTICLE_LOOKS = chart(
  'Tab',
  'Changed',
  'Article Looks',
  "An article's look chosen in its Style tab, or one of its style fields changed.",
  {
    types: [
      'ArticleLookClean',
      'ArticleLookClassic',
      'ArticleLookReport',
      'ArticleLookNotebook',
      'ArticleLookBold',
      'ArticleStyle',
    ],
  },
);

export const WHITEBOARDS: MetricStack = {
  stack: true,
  title: 'Draw Mode',
  blurb:
    'Whiteboard tabs made, mode switches, and the pens, erasers, backgrounds and recognition people use in Draw mode.',
  members: [
    WHITEBOARDS_CREATED,
    EDITOR_MODE_SWITCHES,
    WORKSHOP_CONTROL_TURNED,
    LEAVE_PAGES_CONFIRMED,
    TAB_OPENS_IN,
    PAGE_ORIENTATION,
    PAGES,
    PAGE_SETUP,
    PAGE_BUILDING,
    PAGE_CONTENTS_JUMPS,
    PAGE_SWIPES,
    TAB_WINDOW_USE,
    LOGO_TOOLS,
    LOGO_MIRROR_TWINS,
    LOGO_SWITCHES,
    LOGO_MIRROR_SETTINGS,
    WIREFRAME_DEVICES_CHOSEN,
    WIREFRAME_SYSTEM_BARS,
    EMPTY_PAGE_LAYOUTS_HIDDEN,
    ARTICLE_INSERTS,
    ARTICLE_FORMATTING,
    ARTICLE_LOOKS,
    WHITEBOARD_PENS,
    WHITEBOARD_SETTINGS,
    WHITEBOARD_RECOGNITION,
  ],
  headline: WHITEBOARDS_CREATED,
};

// Layers (docs/specs/006-document/layers.md): made, used, and looked at.
export const LAYERS_CREATED: Metric = {
  category: 'Layer',
  action: 'Added',
  type: null,
  title: 'Layers Created',
  blurb: 'A new layer on a tab.',
};

export const LAYER_TOGGLES: Metric = {
  category: 'Layer',
  action: 'Toggled',
  allTypes: true,
  title: 'Visibility & Lock Toggles',
  blurb:
    'The eye and the padlock, across hide / show / lock / unlock. The gesture layers are actually for.',
};

export const LAYER_MOVES: Metric = {
  category: 'Layer',
  action: 'Moved',
  type: null,
  title: 'Selections Moved to a Layer',
  blurb: 'Elements sent to another layer: layers being used to organise, not just to hide.',
};

export const LAYERS_DELETED: Metric = {
  rising: 'neutral',
  category: 'Layer',
  action: 'Deleted',
  type: null,
  title: 'Layers Deleted',
};

export const LAYERS_PANEL_OPENED: Metric = {
  category: 'Layer',
  action: 'Opened',
  allTypes: true,
  title: 'Layers Panel Opened',
  blurb: 'Read against the layer counts: a panel opened far more often than used is a hint.',
};

export const LAYERS_FEATURE: MetricStack = {
  stack: true,
  title: 'Layers Feature',
  blurb: 'Every layer interaction: layers made, toggled, filled, deleted, and the panel opened.',
  members: [
    LAYERS_CREATED,
    LAYER_TOGGLES,
    LAYER_MOVES,
    LAYERS_DELETED,
    LAYERS_PANEL_OPENED,
    LAYERS_RENAMED,
    LAYERS_SELECTED,
    LAYERS_REORDERED,
    LAYER_OPACITY,
    LAYERS_MERGED,
    LAYERS_CLEARED,
  ],
};

// ---- Editing tab -------------------------------------------------------------
// Tools that organise the work rather than draw it. Tab folders (docs/specs/006-document/tab-folders.md) are
// typed rather than bare because the bare Tab/Folder events belong to
// different subjects: see the type note in docs/specs/017-telemetry/telemetry.md's Folder entry.

export const NOTES_ADDED: Metric = {
  category: 'Note',
  action: 'Added',
  type: null,
  title: 'Notes Added',
  blurb: "An element's note went from empty to written.",
};

export const NOTES_OPENED: Metric = {
  category: 'Note',
  action: 'Opened',
  type: null,
  title: 'Notes Opened',
  blurb: 'The note popover was opened, to read as well as to write.',
};

export const ACTIONS_ASSIGNED: Metric = {
  category: 'Action',
  action: 'Created',
  allTypes: true,
  title: 'Actions Assigned',
  blurb: 'Work on an element assigned to a teammate, with or without the email notification.',
};

export const ACTIONS_EMAILED: Metric = {
  category: 'Action',
  action: 'Created',
  type: 'EmailOn',
  title: 'Actions Emailed',
  blurb:
    'Actions assigned with the notify-by-email box ticked. Part of Actions Assigned. Counts the box, not a sent email: sends are Action Notifications in the Emails Sent stack on the Dashboard.',
};

export const ACTIONS_COMPLETED: Metric = {
  category: 'Action',
  action: 'Resolved',
  // Won't Do closes an action without it being done: its own card, below.
  typeIn: (type) => type !== 'WontDo',
  title: 'Actions Completed',
  blurb: 'Read against actions assigned: the follow-through rate on the feature.',
};

export const ACTIONS_WONT_DO: Metric = {
  category: 'Action',
  action: 'Resolved',
  type: 'WontDo',
  title: 'Actions Closed as Won’t Do',
  blurb:
    'Actions someone decided against: closed without being done, from the canvas or the Actions board.',
};

export const ACTIONS_BOARDS_MADE: Metric = {
  category: 'Action',
  action: 'Linked',
  type: 'Board',
  title: 'Actions Boards Made',
  blurb:
    'Documents that got an Actions board: a board tab where every action in the document has a card, kept in step with the canvas.',
};

export const FOLDERS_CREATED: Metric = {
  category: 'Folder',
  action: 'Created',
  typeIn: (type) => type !== 'Tab',
  title: 'Folders Created',
  blurb: 'Folders of documents, in your own Explorer or a team library.',
};

export const FOLDERS_RE_PARENTED: Metric = {
  category: 'Folder',
  action: 'Moved',
  allTypes: true,
  title: 'Folders Re-parented',
  blurb: 'A folder nested under another, or promoted back to the root.',
};

export const TAB_FOLDERS_CREATED: Metric = {
  category: 'Folder',
  action: 'Created',
  type: 'Tab',
  title: 'Tab Folders Created',
  blurb: 'A collapsible folder of tab pills created inside one document.',
};

export const TABS_FILED: Metric = {
  category: 'Tab',
  action: 'Moved',
  type: 'Folder',
  title: 'Tabs Filed',
  blurb:
    'A tab filed into a tab folder, by the ellipsis menu or by a drag (both report identically).',
};

export const DOCUMENTS_FILED: Metric = {
  category: 'Document',
  action: 'Moved',
  // The Offline Mode conversions are Document·Moved too, charted in their own
  // stack (Taken Offline, Saved to Cloud).
  typeIn: (type) => type !== 'TakenOffline' && type !== 'SavedToCloud',
  title: 'Documents Filed',
  blurb: 'A document moved into a folder, or back to the top level.',
};

export const NOTES: MetricStack = {
  stack: true,
  title: 'Notes',
  blurb: 'Notes written on elements, and opened to read or edit.',
  members: [NOTES_ADDED, NOTES_OPENED, NOTES_DELETED, NOTES_EDITED, NOTE_FORMATTING],
  headline: NOTES_ADDED,
};

export const ASSIGNED_ACTIONS: MetricStack = {
  stack: true,
  title: 'Assigned Actions',
  blurb: 'Work on an element assigned to a teammate, emailed about, and completed.',
  members: [
    ACTIONS_ASSIGNED,
    ACTIONS_EMAILED,
    ACTIONS_COMPLETED,
    ACTIONS_WONT_DO,
    ACTIONS_BOARDS_MADE,
    ACTIONS_EDITED,
    ACTIONS_OPENED,
    ACTIONS_DELETED,
    ACTIONS_REOPENED,
    ACTIONS_MOVED_TO_TEAM,
  ],
  headline: ACTIONS_ASSIGNED,
};

// The Explorer sidebar and the editor's Explorer panel (docs/specs/013-workspace/explorer-structure.md):
// UI·Selected·Sidebar.<Row> / ExplorerPanel.<Row>, one per row activated, by kind (never a name).
export const EXPLORER_SIDEBAR_PICKS = chart(
  'UI',
  'Selected',
  'Explorer Sidebar Picks',
  "A row picked in the Explorer sidebar or the editor's Explorer panel: Home, Inbox, Timeline, a space or folder, This Browser, the Library pages, or Trash. Picks of the Activity row, the Inbox's old name, still count here as history.",
  {
    typeIn: (type) =>
      (type ?? '').startsWith('Sidebar.') || (type ?? '').startsWith('ExplorerPanel.'),
    rising: 'neutral',
  },
);

// The Explorer's filters (docs/specs/013-workspace/explorer-filters.md "Telemetry"):
// Explorer·Selected·<Facet>, one per filter that gained a value, by kind (never what was picked).
export const EXPLORER_FILTERS_PICKED = chart(
  'Explorer',
  'Selected',
  'Explorer Filters Used',
  'A filter reached for in the Explorer, by kind: words, Opens in, Kind, Template, Made by AI, Edited, People or Space, from a chip, a suggestion or a typed token.',
  { rising: 'good' },
);

// Tags (docs/specs/013-workspace/tags.md "Telemetry"): coloured labels people put on their documents. Never a name.
export const TAGS_CREATED = chart(
  'Explorer',
  'Created',
  'Tags Made',
  'A tag made, from the tag picker on a document or New Tag on the Tags page.',
  { types: ['Tag'], rising: 'good' },
);

export const TAGS_APPLIED = chart(
  'Explorer',
  'Added',
  'Tags Put On or Taken Off',
  'A tag ticked on or off a document in the tag picker.',
  { actionIn: ['Added', 'Removed'], types: ['Tag'], rising: 'good' },
);

export const TAGS_EDITED = chart(
  'Explorer',
  'Renamed',
  'Tags Renamed, Recoloured or Deleted',
  'A tag renamed or recoloured, or deleted (which takes it off every document).',
  { actionIn: ['Renamed', 'Changed', 'Deleted'], types: ['Tag', 'TagColour'], rising: 'neutral' },
);

// The Explorer's find (docs/specs/013-workspace/explorer-structure.md "Telemetry"): Ctrl F reaching the page's search
// or opening the panel's find field, since in-page find cannot see a long list's rows that are not drawn.
export const EXPLORER_FIND_OPENED = chart(
  'Explorer',
  'Opened',
  'Explorer Find Opened',
  "Ctrl F (Cmd F) in the Explorer: the caret put in the page's search, or the panel's find field opened.",
  { types: ['FindShortcut', 'PanelFind'], rising: 'good' },
);

// Default folders (docs/specs/013-workspace/default-folders.md "Telemetry"): one type per key.
export const DEFAULT_FOLDERS_SET = chart(
  'Folder',
  'Changed',
  'Default Folders Set',
  'A folder chosen as where new documents of one kind land: from a folder menu, the New Document wizard or Settings.',
  { rising: 'good' },
);

export const DEFAULT_FOLDERS_CLEARED = chart(
  'Folder',
  'Cleared',
  'Default Folders Cleared',
  'A default folder cleared, so new documents of that kind land in My Documents again.',
  { rising: 'neutral' },
);

export const ORGANISATION: MetricStack = {
  stack: true,
  title: 'Organisation',
  blurb:
    'Folders made and nested, tab folders, tabs and documents filed, tags, default folders, the Explorer sidebar and its filters.',
  members: [
    FOLDERS_CREATED,
    FOLDERS_RE_PARENTED,
    TAB_FOLDERS_CREATED,
    TABS_FILED,
    DOCUMENTS_FILED,
    FOLDERS_DELETED,
    FOLDERS_RENAMED,
    TABS_UNFILED,
    EXPLORER_SIDEBAR_PICKS,
    EXPLORER_FILTERS_PICKED,
    EXPLORER_FIND_OPENED,
    TAGS_CREATED,
    TAGS_APPLIED,
    TAGS_EDITED,
    DEFAULT_FOLDERS_SET,
    DEFAULT_FOLDERS_CLEARED,
  ],
};

// The editor's search panel.
export const SEARCH_OPENED = chart(
  'Search',
  'Opened',
  'Search Opened',
  'The editor search panel opened.',
);

export const SEARCH_QUERIES = chart(
  'Search',
  'Searched',
  'Searches',
  'A query typed into the panel, once per open.',
);

export const SEARCH_RESULTS_PICKED = chart(
  'Search',
  'Selected',
  'Results Picked',
  'A command, element or help result chosen.',
);

export const EDITOR_SEARCH: MetricStack = {
  stack: true,
  title: 'Editor Search',
  blurb: 'The search panel: opened, searched, and a result picked.',
  members: [SEARCH_OPENED, SEARCH_QUERIES, SEARCH_RESULTS_PICKED],
  headline: SEARCH_OPENED,
};

// The palette beyond adding elements (Palette tab has the rankings).
export const PALETTE_SEARCHES = chart(
  'UI',
  'Searched',
  'Palette Searches',
  'Searches inside the palette, its icons, technology marks and behaviours.',
);

export const PALETTE_GROUPS_OPENED = chart(
  'UI',
  'Opened',
  'Palette Groups Opened',
  'A palette group, toolbar overflow or toolbar search opened.',
  {
    typeIn: (type) =>
      (type ?? '').endsWith('Group') ||
      type === 'ToolbarMore' ||
      type === 'ToolbarExplorer' ||
      type === 'ToolbarSearch' ||
      type === 'ToolbarSearchOtherModes' ||
      type === 'ToolbarSearchUnavailable',
  },
);

export const TOOLBAR_CATEGORY = chart(
  'UI',
  'Changed',
  'Toolbar Category',
  'The Toolbar layout switched to another category.',
  { types: ['ToolbarCategory'] },
);

export const PALETTE_USE: MetricStack = {
  stack: true,
  title: 'Palette Use',
  blurb: 'How the palette gets used beyond adding elements: searches, groups, and the toolbar.',
  members: [PALETTE_SEARCHES, PALETTE_GROUPS_OPENED, TOOLBAR_CATEGORY],
  seeAlso: { section: 'palette', label: 'See Each Element in Features › Palette' },
};

// The canvas selection modes, one chart per mode, and the options set inside
// them (Canvas Modes tab has the rankings).
const MODE_TITLES: Record<string, string> = {
  Laser: 'Laser',
  Spotlight: 'Spotlight',
  Eraser: 'Eraser',
  FormatPainter: 'Format Painter',
  Isometric: 'Isometric',
  AvatarMode: 'Avatar Mode',
};

export const MODE_METRICS: readonly Metric[] = SELECTION_MODES.map((mode) =>
  chart(
    'Canvas',
    'Used',
    MODE_TITLES[mode] ?? mode,
    `The ${(MODE_TITLES[mode] ?? mode).toLowerCase()} mode switched on from the palette.`,
    { types: [mode] },
  ),
);

// The office's machines (docs/specs/009-elements/office.md "Using it"): a drink taken in Avatar mode.
export const OFFICE_DRINKS = chart(
  'Canvas',
  'Used',
  'Office Drinks',
  'A drink taken at a water cooler or a coffee machine in Avatar mode.',
  { types: ['WaterCooler', 'CoffeeMachine'] },
);

// Avatar Pad arrivals (docs/specs/009-elements/avatar-pad.md "Telemetry"): an entry into Avatar mode that started on a
// pad, once per entry, never per peer seen arriving.
export const AVATAR_PAD_ARRIVALS = chart(
  'Canvas',
  'Used',
  'Avatar Pad Arrivals',
  'An entry into Avatar mode that started on an Avatar Pad, the character beamed in.',
  { types: ['AvatarPadArrival'] },
);

// Avatar-mode speech bubbles (docs/specs/008-canvas/avatar-mode.md "Speech bubbles"): that somebody spoke, by
// either door, never what they said.
export const AVATAR_MESSAGES = chart(
  'Canvas',
  'Used',
  'Avatar Messages',
  'A message said in a speech bubble in Avatar mode, typed above the character or sent from the Avatar panel.',
  { types: ['AvatarMessage', 'AvatarMessagePanel'] },
);

export const CANVAS_MODES: MetricStack = {
  stack: true,
  title: 'Canvas Modes',
  blurb: 'Ways of working on the canvas picked from the palette, and the options set inside them.',
  members: [...MODE_METRICS, OFFICE_DRINKS, AVATAR_PAD_ARRIVALS, AVATAR_MESSAGES, MODE_OPTIONS],
  // Modes switched into; tweaking an option inside one is not another use.
  headline: [...MODE_METRICS],
  seeAlso: { section: 'modes', label: 'See Each Mode in Features › Modes' },
};

// Editor chrome: layout and navigation.
export const CANVAS_ZOOMS = chart(
  'Canvas',
  'Zoomed',
  'Canvas Zooms',
  'Zoomed in or out, to fit, to a preset, or on a double-tapped spot.',
);

export const ZEN_MODE = chart('UI', 'Toggled', 'Zen Mode', 'Zen mode switched on or off.', {
  types: ['ZenModeOn', 'ZenModeOff'],
  rising: 'neutral',
});

export const LANDSCAPE_BARS = chart(
  'UI',
  'Toggled',
  'Landscape Bars',
  'The header and tabs shown or folded from the handle on a phone held sideways.',
  { types: ['LandscapeBarsOn', 'LandscapeBarsOff'], rising: 'neutral' },
);

export const PANELS_DOCKED = chart(
  'UI',
  'Moved',
  'Panels Docked',
  'A panel dragged into a corner dock, or out of one.',
  { types: ['PanelDock'], rising: 'neutral' },
);

export const EXPLORER_VIEW = chart(
  'UI',
  'Toggled',
  'Explorer View',
  'The Explorer switched between cards and a list.',
  { typeIn: (type) => (type ?? '').startsWith('ExplorerView'), rising: 'neutral' },
);

// An item run from a text document's tool finder, Search the menus (docs/specs/004-interface-design/office-shell.md).
export const TOOL_FINDER_USED = chart(
  'UI',
  'Used',
  'Tool Finder Used',
  "An item run from a text document's tool finder (Search the menus).",
  { types: ['TextDocumentToolFinder'] },
);

// A text document starred from its title row (docs/specs/034-text-documents/editing-surface.md "The title row").
export const TEXT_DOCUMENT_STARRED = chart(
  'UI',
  'Toggled',
  'Text Document Star',
  "A text document's star pressed in its title row.",
  { types: ['TextDocumentStar'], rising: 'neutral' },
);

// A text document's zoom changed from its toolbar (docs/specs/034-text-documents/editing-surface.md "Zoom").
export const TEXT_DOCUMENT_ZOOMED = chart(
  'UI',
  'Changed',
  'Text Document Zoom',
  "A text document's zoom changed from its toolbar: Fit, a preset or a typed value.",
  { types: ['TextDocumentZoom'], rising: 'neutral' },
);

// A person changed their editing mode on a text document (docs/specs/034-text-documents/review.md "Editing modes").
export const TEXT_DOCUMENT_MODE = chart(
  'UI',
  'Changed',
  'Text Document Mode',
  'Someone switched a text document between Editing and Viewing.',
  { types: ['TextDocumentMode'], rising: 'neutral' },
);

// A person here followed from a text document's title row: their caret brought into view, or their tab opened.
export const TEXT_DOCUMENT_FOLLOWED = chart(
  'UI',
  'Used',
  'Person Followed',
  "Someone here pressed in a text document's title row, to see where they are.",
  { types: ['TextDocumentFollow'] },
);

// A text document's writing formatted (docs/specs/034-text-documents/text-and-paragraphs.md "Telemetry"): bold,
// italic, a size and the rest, from the toolbar, the Format menu or a shortcut, by the format's name.
export const TEXT_DOCUMENT_FORMATTING = chart(
  'Element',
  'Changed',
  'Text Document Formatting',
  "A text document's writing formatted: bold, italic, underline, strikethrough, a size, its case, colour and the rest.",
  { typeIn: (t) => (t ?? '').startsWith('TextDocumentFormat') },
);

// A text document's paragraph styles (docs/specs/034-text-documents/text-and-paragraphs.md "Paragraph styles",
// "Update to match", "Default styles"): a style applied from the toolbar, Format > Paragraph styles or a shortcut; a
// style updated to match the caret; the person's default styles used, or Google's put back.
const TEXT_DOCUMENT_PARAGRAPH_STYLE_TYPES = [
  'TextDocumentParagraphStyle',
  'TextDocumentStyleUpdated',
  'TextDocumentStylesUsed',
  'TextDocumentStylesReset',
];
export const TEXT_DOCUMENT_PARAGRAPH_STYLE = chart(
  'Element',
  'Changed',
  'Text Document Paragraph Style',
  "A text document's paragraph styles: one applied, one updated to match, the person's default styles used or reset.",
  { types: TEXT_DOCUMENT_PARAGRAPH_STYLE_TYPES },
);

// A text document's paragraphs formatted (docs/specs/034-text-documents/text-and-paragraphs.md "Alignment and
// indents", "Spacing and keep rules", "Borders and shading"): aligned, indented, spaced, bordered, or a keep rule switched.
export const TEXT_DOCUMENT_PARAGRAPH_FORMATTING = chart(
  'Element',
  'Changed',
  'Text Document Paragraph Formatting',
  "A text document's paragraphs aligned, indented, spaced, bordered or shaded, or a keep rule switched.",
  {
    types: [
      'TextDocumentAlign',
      'TextDocumentIndent',
      'TextDocumentIndentation',
      'TextDocumentLineSpacing',
      'TextDocumentParagraphSpace',
      'TextDocumentCustomSpacing',
      'TextDocumentKeepRule',
      'TextDocumentBordersAndShading',
    ],
  },
);

// A text document's ruler (docs/specs/034-text-documents/editing-surface.md "The ruler"): an indent dragged or moved
// with the keys, and tab stops added, moved or taken away.
export const TEXT_DOCUMENT_RULER = chart(
  'Element',
  'Changed',
  'Text Document Ruler',
  "A text document's indents set on the ruler, or its tab stops added, moved or taken away.",
  { types: ['TextDocumentRulerIndent', 'TextDocumentTabStop'] },
);

// A text document's page setup changed (docs/specs/034-text-documents/page-layout.md "Page setup"): margins dragged on
// the ruler, File > Page setup's OK, Format > Page orientation's OK, pageless switched on or off.
export const TEXT_DOCUMENT_PAGE_SETUP = chart(
  'Tab',
  'Changed',
  'Text Document Page Setup',
  "A text document's margins dragged on the ruler, its page setup or orientation changed by their dialogs, or it switched to pageless or back.",
  {
    types: [
      'TextDocumentMargins',
      'TextDocumentPageSetup',
      'TextDocumentPageOrientation',
      'TextDocumentPageless',
    ],
  },
);

// A text document's columns changed (docs/specs/034-text-documents/page-layout.md "Columns"): Format > Columns' one,
// two or three, or Column options' Apply.
export const TEXT_DOCUMENT_COLUMNS = chart(
  'Tab',
  'Changed',
  'Text Document Columns',
  "A text document section's columns changed from Format > Columns, or by Column options.",
  { types: ['TextDocumentColumns'] },
);

// A text document's line numbers changed (docs/specs/034-text-documents/page-layout.md "Line numbers"): shown, hidden or
// restarting otherwise, from the Line numbers panel.
export const TEXT_DOCUMENT_LINE_NUMBERS = chart(
  'Tab',
  'Changed',
  'Text Document Line Numbers',
  "A text document's line numbers shown, hidden or restarting otherwise from Tools > Line numbers.",
  { types: ['TextDocumentLineNumbers'] },
);

// A text document's watermark set, changed or taken away (docs/specs/034-text-documents/page-layout.md "Watermark"),
// from the Watermark panel.
export const TEXT_DOCUMENT_WATERMARK = chart(
  'Tab',
  'Changed',
  'Text Document Watermark',
  "A text document's watermark set, changed or removed from Insert > Watermark.",
  { types: ['TextDocumentWatermark'] },
);

// A text document's header or footer made or taken away (docs/specs/034-text-documents/page-layout.md "Headers and
// footers"): made by entering a page that shows none, removed by leaving one empty.
export const TEXT_DOCUMENT_HEADER_FOOTER = chart(
  'Tab',
  'Changed',
  'Text Document Header Footer',
  'A text document header or footer made from Insert > Headers & footers or a double-click in a margin, or removed.',
  { types: ['TextDocumentHeaderFooter'] },
);

// Page numbers put in a text document (docs/specs/034-text-documents/page-layout.md "Page numbers"): from Insert > Page
// numbers' presets or the Page numbers dialog, and a page count put in at the caret.
export const TEXT_DOCUMENT_PAGE_NUMBERS = chart(
  'Element',
  'Added',
  'Text Document Page Numbers',
  'Page numbers put in a text document from Insert > Page numbers or its dialog, and page counts put in at the caret.',
  { types: ['TextDocumentPageNumbers', 'TextDocumentPageCount'] },
);

// A footnote put in a text document (docs/specs/034-text-documents/page-layout.md "Footnotes"): Insert > Footnote or
// Ctrl+Alt+F.
export const TEXT_DOCUMENT_FOOTNOTES = chart(
  'Element',
  'Added',
  'Text Document Footnotes',
  'A footnote put in a text document from Insert > Footnote or with Ctrl+Alt+F.',
  { types: ['TextDocumentFootnote'] },
);

// A page, column or section break inserted in a text document (docs/specs/034-text-documents/page-layout.md "Breaks").
export const TEXT_DOCUMENT_BREAKS = chart(
  'Element',
  'Added',
  'Text Document Breaks',
  'A page, column or section break (on the next page or continuous), inserted from Insert > Break or with Ctrl+Enter.',
  {
    types: [
      'TextDocumentBreakPage',
      'TextDocumentBreakColumn',
      'TextDocumentBreakSectionNextPage',
      'TextDocumentBreakSectionContinuous',
    ],
  },
);

// The ruler shown or hidden (docs/specs/034-text-documents/editing-surface.md "The ruler").
export const TEXT_DOCUMENT_RULER_TOGGLED = chart(
  'UI',
  'Toggled',
  'Text Document View Switches',
  "Someone showed or hid a text document's ruler, its non-printing characters or its print layout (View menu).",
  { types: ['TextDocumentRuler', 'TextDocumentNonPrinting', 'TextDocumentPrintLayout'] },
);

// A person's pageless text width chosen (docs/specs/034-text-documents/page-layout.md "Pageless"): View > Text width.
export const TEXT_DOCUMENT_TEXT_WIDTH = chart(
  'UI',
  'Changed',
  'Text Document Text Width',
  "Someone chose the width of a pageless text document's column from View > Text width.",
  {
    types: [
      'TextDocumentTextWidthNarrow',
      'TextDocumentTextWidthMedium',
      'TextDocumentTextWidthWide',
      'TextDocumentTextWidthFull',
    ],
  },
);

// A text document's lists (docs/specs/034-text-documents/lists.md "Telemetry"): paragraphs put in a list or taken out,
// by its kind, a list style taken, numbering restarted or continued, and checklist items ticked.
export const TEXT_DOCUMENT_LISTS = chart(
  'Element',
  'Changed',
  'Text Document Lists',
  "A text document's paragraphs made a bulleted, numbered or checklist list, or taken out of one; a list style taken; numbering restarted or continued; checklist items ticked.",
  {
    typeIn: (t) => (t ?? '').startsWith('TextDocumentList') || t === 'TextDocumentChecklistTicked',
  },
);

// A text document's pastes (docs/specs/034-text-documents/text-and-paragraphs.md "Clipboard"), by what was read:
// LiveDoc's own fragment, HTML from elsewhere, or plain text.
export const TEXT_DOCUMENT_PASTE = chart(
  'Element',
  'Changed',
  'Text Document Paste',
  'Something pasted into a text document: from a text document, HTML from a web page or another editor, or plain text.',
  {
    types: [
      'TextDocumentPasteDocument',
      'TextDocumentPasteHtml',
      'TextDocumentPasteMarkdown',
      'TextDocumentPastePlain',
    ],
  },
);

// Several stretches of a text document's text selected at once (docs/specs/034-text-documents/text-and-paragraphs.md
// "Selection"): by the keys or the pointer, or by Select all matching text.
export const TEXT_DOCUMENT_SELECTION = chart(
  'UI',
  'Used',
  'Text Document Selection',
  "Several stretches of a text document's text selected at once, by keys or pointer, or by Select all matching text.",
  { types: ['TextDocumentStretches', 'TextDocumentSelectMatching'] },
);

// Someone kept a text document's styles or page setup as their default (text-and-paragraphs.md "Default styles",
// page-layout.md "Page setup").
export const TEXT_DOCUMENT_DEFAULT_STYLES = chart(
  'UI',
  'Changed',
  'Text Document Defaults',
  "Someone saved a text document's styles or page setup as their default, for the documents they make next.",
  { types: ['TextDocumentDefaultStyles', 'TextDocumentPageDefault'], rising: 'neutral' },
);

// Someone changed their typing aids with Tools > Preferences' OK (docs/specs/034-text-documents/tools.md "Preferences").
export const TEXT_DOCUMENT_PREFERENCES = chart(
  'UI',
  'Changed',
  'Text Document Preferences',
  "Someone changed their typing aids or substitutions in a text document's Tools > Preferences.",
  { types: ['TextDocumentPreferences'], rising: 'neutral' },
);

// My fonts changed by the Fonts dialog's OK (docs/specs/004-interface-design/fonts.md "More fonts").
export const TEXT_DOCUMENT_MY_FONTS = chart(
  'UI',
  'Changed',
  'Text Document My Fonts',
  'Someone added families to the font menu from More fonts, or took them out.',
  { types: ['TextDocumentMyFonts'], rising: 'neutral' },
);

export const EDITOR_CHROME: MetricStack = {
  stack: true,
  title: 'Editor Chrome',
  blurb:
    'Getting around and arranging the workspace: zoom, zen mode, the bars on a phone held sideways, panel layout, the Explorer view.',
  members: [
    CANVAS_ZOOMS,
    ZEN_MODE,
    LANDSCAPE_BARS,
    PANELS_DOCKED,
    EXPLORER_VIEW,
    TOOL_FINDER_USED,
    TEXT_DOCUMENT_STARRED,
    TEXT_DOCUMENT_FOLLOWED,
    TEXT_DOCUMENT_ZOOMED,
    TEXT_DOCUMENT_MODE,
    TEXT_DOCUMENT_MY_FONTS,
    TEXT_DOCUMENT_DEFAULT_STYLES,
    TEXT_DOCUMENT_PREFERENCES,
  ],
};

// Dialogs and panels opened (UI·Opened), split by what was opened.
const OPENED_HOMES: ((type: string | null) => boolean)[] = [];

const opened = (title: string, blurb: string, typeIn: (type: string | null) => boolean): Metric => {
  OPENED_HOMES.push(typeIn);
  return chart('UI', 'Opened', title, blurb, { typeIn });
};

export const SETTINGS_OPENED = opened(
  'Settings Opened',
  'The Settings dialog opened.',
  (t) => t === 'Settings',
);

export const SETTINGS_CATEGORIES_VISITED = opened(
  'Settings Categories Visited',
  'A category picked inside the open Settings dialog: Appearance, Editor, Account and the rest.',
  isSettingsCategory,
);

export const SHARE_OPENED = opened(
  'Share Opened',
  'The Share dialog or the collaborators list opened.',
  (t) => t === 'Share' || t === 'Collaborators',
);

export const PICKERS_OPENED = opened(
  'Theme & Canvas Pickers',
  'The theme picker or the canvas style panel opened.',
  (t) => t === 'ThemePicker' || t === 'CanvasStyle',
);

export const HELP_FROM_EDITOR = opened(
  'Help from the Editor',
  'A help article opened from inside the editor.',
  isHelpArticleType,
);

export const SHORTCUTS_OPENED = opened(
  'Shortcuts Opened',
  'The keyboard shortcuts list opened, on a canvas or in a text document.',
  (t) => t === 'Shortcuts' || t === 'TextDocumentShortcuts',
);

// Edit Outline (docs/specs/009-elements/mind-node.md): how often a mind map is opened as text.
export const MIND_OUTLINE_OPENED = opened(
  'Mind Map Outline Opened',
  "A mind map's outline opened to edit it as text.",
  (t) => t === 'MindOutline',
);

export const TOUR_OFFERED = opened(
  'Tour Offered',
  'The Diagram tour (the welcome tour until October 2026) offered. Since 28 October 2026, the Start Tour button in the bottom bar showing it.',
  (t) => t === 'TourOffer',
);

// The Plan tour's offer (docs/specs/026-plan/plan-tour.md); charted in its funnel on the Visitors tab.
export const PLAN_TOUR_OFFERED = opened(
  'Plan Tour Offered',
  'The Plan tour offered, the first time someone works in Plan mode. Since 28 October 2026, the Start Tour button in the bottom bar showing it.',
  (t) => t === 'PlanTourOffer',
);

// The Workshop tour's offer (docs/specs/012-collaboration/workshop-tour.md); charted in its funnel on
// the Visitors tab.
export const WORKSHOP_TOUR_OFFERED = opened(
  'Workshop Tour Offered',
  'The Workshop tour offered, the first time someone works in Workshop mode. Since 28 October 2026, the Start Tour button in the bottom bar showing it.',
  (t) => t === 'WorkshopTourOffer',
);

// The Draw tour's offer (docs/specs/023-draw-mode/draw-tour.md); charted in its funnel on the Visitors tab.
export const DRAW_TOUR_OFFERED = opened(
  'Draw Tour Offered',
  'The Draw tour offered, the first time someone works in Draw mode. Since 28 October 2026, the Start Tour button in the bottom bar showing it.',
  (t) => t === 'DrawTourOffer',
);

// The Forms tour's offer (docs/specs/030-forms/forms.md "The Forms tour"); charted in its funnel on the Visitors tab.
export const FORM_TOUR_OFFERED = opened(
  'Forms Tour Offered',
  'The Forms tour offered, the first time an Editor opens a Form tab. Since 28 October 2026, the Start Tour button in the bottom bar showing it.',
  (t) => t === 'FormTourOffer',
);

// The Avatar tour's offer (docs/specs/008-canvas/avatar-tour.md); charted in its funnel on the Visitors tab.
export const AVATAR_TOUR_OFFERED = opened(
  'Avatar Tour Offered',
  'The Avatar tour offered, the first time someone walks as an avatar. Since 28 October 2026, the Start Tour button in the bottom bar showing it.',
  (t) => t === 'AvatarTourOffer',
);

// The Pages tour's offer (docs/specs/007-editor/pages-tour.md); charted in its funnel on the Visitors tab.
export const PAGES_TOUR_OFFERED = opened(
  'Pages Tour Offered',
  'The Pages tour offered, the first time someone works in Pages mode. Since 28 October 2026, the Start Tour button in the bottom bar showing it.',
  (t) => t === 'PagesTourOffer',
);

// The element tours' offers (docs/specs/007-editor/element-tours.md), any `<Kind>TourOffer`; charted in their funnel on
// the Visitors tab, which names the kinds.
export const ELEMENT_TOURS_OFFERED = opened(
  'Element Tours Offered',
  'An element tour offered beside a selected element, once per kind per visit. Since 28 October 2026, the Start Tour button in the bottom bar showing it.',
  (t) => elementTourTokens('Offer').includes(t ?? ''),
);

// The power user mode offer (docs/specs/007-editor/power-user-mode.md); charted in its funnel on
// the Visitors tab.
export const POWER_USER_OFFERED = opened(
  'Power User Mode Offered',
  'The offer shown, after 20 editing days or 50 shortcuts on one device.',
  (t) => t === 'PowerUserOffer',
);

// The new version prompt (docs/specs/016-platform/new-version-prompt.md); charted with its reloads
// on the Visitors tab.
export const NEW_VERSION_OFFERED = opened(
  'New Version Offered',
  'An open editor heard the server serves a newer document format, and offered a reload.',
  (t) => t === 'NewVersionPrompt',
);

export const SLIDE_DECK_OPENED = opened(
  'Slide Deck Opened',
  'The Slide Deck panel or presentation settings opened.',
  (t) => t === 'SlideDeck' || t === 'PresentationSettings',
);

// The Session strip's buttons in the bottom-right cluster (docs/specs/012-collaboration/session-tools.md
// "The Session strip"), each opening its tool: the set-up while idle, the live tool while running.
export const SESSION_TIMER_OPENED = opened(
  'Timer Button Opened',
  'The Timer button in the bottom bar opened, to start a timer or to drive the one running.',
  (t) => t === 'SessionTimer',
);

export const SESSION_VOTE_OPENED = opened(
  'Vote Button Opened',
  'The Vote button in the bottom bar opened, to start a vote or to follow the one running.',
  (t) => t === 'SessionVote',
);

export const SESSION_POLL_OPENED = opened(
  'Poll Button Opened',
  'The Poll button in the bottom bar opened, to ask a question or to read the answers.',
  (t) => t === 'SessionPoll',
);

export const ACTION_SIGN_IN_NUDGE = opened(
  'Assign Action Nudge',
  'A guest opened Assign Action and was asked to sign in, since actions need an account.',
  (t) => t === 'ActionSignInNudge',
);

// The move prompt after signing in (docs/specs/014-identity/auth-and-guest-access.md "Moving documents in This Browser
// after signing in"); charted with Offline Mode on the Dashboard.
export const LOCAL_MOVE_OFFERED = opened(
  'Move Prompt Shown',
  'Someone signed in with documents kept only in this browser and was offered to move them to the account.',
  (t) => t === 'LocalMovePrompt',
);

OPENED_HOMES.push(PALETTE_GROUPS_OPENED.typeIn!);

// A text document's menus opened from its menu bar (docs/specs/004-interface-design/office-shell.md "Telemetry"):
// File, Edit, View and the rest, by name.
export const TEXT_DOCUMENT_MENUS_OPENED = opened(
  'Text Document Menus',
  "A menu of a text document's menu bar opened: File, Edit, View, Insert, Format, Tools, Extensions or Help.",
  (t) => (t ?? '').startsWith('TextDocumentMenu'),
);

// A text document's side panel opened (docs/specs/004-interface-design/office-shell.md "Side panels"): the outline, line numbers and the watermark.
export const TEXT_DOCUMENT_PANELS_OPENED = opened(
  'Text Document Panels',
  'A side panel of a text document opened from its menu or shortcut: the outline, line numbers or the watermark.',
  (t) => (t ?? '').startsWith('TextDocumentPanel'),
);

// A text document's context menu opened (docs/specs/004-interface-design/office-shell.md "Context menus").
export const TEXT_DOCUMENT_CONTEXT_MENU_OPENED = opened(
  'Text Document Context Menu',
  "The context menu on a text document's writing opened, by a right-click or from the keyboard.",
  (t) => t === 'TextDocumentContextMenu',
);

// The Fonts dialog of a text document opened from its font menu's More fonts (fonts.md "More fonts").
export const TEXT_DOCUMENT_MORE_FONTS_OPENED = opened(
  'Text Document More Fonts',
  "The Fonts dialog opened from a text document's font menu, to add families from Google Fonts.",
  (t) => t === 'TextDocumentMoreFonts',
);

export const OTHER_OPENED = chart(
  'UI',
  'Opened',
  'Other Panels Opened',
  'Any other dialog or panel opened.',
  { typeIn: (t) => !OPENED_HOMES.some((home) => home(t)) },
);

export const PANELS_OPENED: MetricStack = {
  stack: true,
  title: 'Dialogs & Panels',
  blurb: 'Which dialogs and panels people open, from Settings and Share to help articles.',
  members: [
    SETTINGS_OPENED,
    SETTINGS_CATEGORIES_VISITED,
    SHARE_OPENED,
    PICKERS_OPENED,
    HELP_FROM_EDITOR,
    SHORTCUTS_OPENED,
    MIND_OUTLINE_OPENED,
    ACTION_SIGN_IN_NUDGE,
    TEXT_DOCUMENT_MENUS_OPENED,
    TEXT_DOCUMENT_PANELS_OPENED,
    TEXT_DOCUMENT_CONTEXT_MENU_OPENED,
    TEXT_DOCUMENT_MORE_FONTS_OPENED,
    OTHER_OPENED,
  ],
  seeAlso: { section: 'editing', label: 'See Each Dialog in Features › Editing' },
};

// Look and feel (Look & Feel tab has the rankings).
export const TEMPLATES_USED = chart(
  'Template',
  'Used',
  'Templates Used',
  'A template picked to start a document or seed a tab.',
);

// A template a start's search found in another mode (docs/specs/007-editor/start-diagramming.md "Found in other
// modes"), switching the tab to that mode: how often a search crosses modes. Each is a Template Used too.
export const TEMPLATES_FROM_OTHER_MODES = chart(
  'UI',
  'Used',
  'Templates From Other Modes',
  "A template chosen from another mode's matches in a start's search, switching the tab to that mode.",
  { types: ['StartOtherMode'] },
);

export const THEMES_CHOSEN = chart(
  'Theme',
  'Changed',
  'Themes Chosen',
  'A built-in theme picked, at creation or later.',
  { typeIn: (t) => !isNonThemePick(t) },
);

export const CANVAS_STYLES_PICKED = chart(
  'Canvas',
  'Changed',
  'Canvas Styles Picked',
  'A background pattern picked for the canvas.',
  { typeIn: (t) => !NON_PATTERN_CANVAS_TYPES.includes(t ?? '') },
);

export const CANVAS_CONTROLS_TWEAKED = chart(
  'Canvas',
  'Changed',
  'Canvas Controls Tweaked',
  'The canvas colour, opacity, pattern colour, scale or animation speed changed.',
  { types: NON_PATTERN_CANVAS_TYPES, rising: 'neutral' },
);

export const CUSTOM_THEMES = chart(
  'Theme',
  'Created',
  'Custom Themes',
  'The custom-theme builder: created, applied, edited and deleted.',
  { actionIn: ['Changed', 'Deleted'], typeIn: (t) => CUSTOM_THEME_TYPES.has(t ?? '') },
);

// The quick style panel's own palette (docs/specs/008-canvas/quick-style-panel.md): a swatch replaced with
// a colour of your own, or put back to the theme's.
export const CUSTOM_SWATCHES = chart(
  'UI',
  'Changed',
  'Custom Swatches',
  'A quick style panel swatch replaced with a colour of your own, or put back to the theme colour.',
  { types: ['QuickSwatchCustom', 'QuickSwatchReset'], rising: 'neutral' },
);

// The Highlighter's next-stroke settings (docs/specs/008-canvas/highlighter.md "Settings"), chosen in
// the quick style panel while its tile is armed. Restyling a drawn highlight is an Element change.
export const HIGHLIGHTER_SETTINGS = chart(
  'UI',
  'Changed',
  'Highlighter Settings',
  "The Highlighter's colour or width changed for the next stroke, in the quick style panel.",
  { types: ['HighlighterColour', 'HighlighterWidth'], rising: 'neutral' },
);

// The Tab Style popover's Finish filter beside its Looks carousel (docs/specs/011-theme/
// canvas-and-theme-dialog.md).
export const LOOKS_FILTERED = chart(
  'UI',
  'Changed',
  'Looks Filtered',
  "The Tab Style popover's Looks narrowed to one finish with its Finish filter, or switched to the seasonal looks with its Seasonal toggle.",
  { types: ['LooksFinishFilter', 'LooksSeasonal'], rising: 'neutral' },
);

export const LOOK_AND_FEEL: MetricStack = {
  stack: true,
  title: 'Look & Feel',
  blurb:
    "The visual presets people reach for: templates (and those found in another mode by a start's search), themes, canvas styles, and their own themes. Headed by themes and canvas styles picked: a template also applies its theme, so adding templates would count that pick twice.",
  members: [
    TEMPLATES_USED,
    TEMPLATES_FROM_OTHER_MODES,
    THEMES_CHOSEN,
    CANVAS_STYLES_PICKED,
    CANVAS_CONTROLS_TWEAKED,
    CUSTOM_THEMES,
    CUSTOM_SWATCHES,
    LOOKS_FILTERED,
    HIGHLIGHTER_SETTINGS,
  ],
  headline: [THEMES_CHOSEN, CANVAS_STYLES_PICKED],
  seeAlso: { section: 'lookfeel', label: 'See Each Preset in Features › Look & Feel' },
};
