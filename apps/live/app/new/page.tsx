'use client';

import { trustedHtml } from '@livedoc/ui';

import dynamic from 'next/dynamic';
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { StatusTopLine } from '@/components/chrome/lines/StatusTopLine';
import { ApiErrorPage } from '@/components/chrome/ApiErrorPage';
import { NewDocumentWizard } from '@/components/palette/NewDocumentWizard';
import { makeNewPdf } from './new-pdf';
import type { NewPdfSource } from '@/lib/new-document/start-new-pdf';
import type { NewDocumentSettings } from './new-document-settings';
import { DocumentLoading } from '@/components/chrome/DocumentLoading';
import { OpeningScreen } from '@/components/chrome/OpeningScreen';
import { RecentDocumentsCard } from './RecentDocumentsCard';
import { EARLY_MODE_SCRIPT, EARLY_MODE_STYLE } from './early-mode-choice';
import { AnimatedLinesBackdrop } from '@/components/canvas/AnimatedLinesBackdrop';
import { useAccountApiBootstrap } from '@/hooks/persistence/useAccountApiBootstrap';
import { useCtaAttribution } from './useCtaAttribution';
import { apiLoadSelf, apiSaveSelf } from '@/lib/api-client';
import {
  attemptCreate,
  createIdsFor,
  type CreateFailure,
  type CreateIds,
} from '@/lib/new-document/create-failure';
import { isOfflineLocation } from '@/lib/save-locations';
import { useNewDocumentLocation } from './useNewDocumentLocation';
import { randomColor, randomName, type Participant } from '@/lib/identity';
import { track } from '@/lib/telemetry';
import { trackDailyReturn } from '@/lib/daily-return';
import { markNameConfirmed } from '@/lib/local-identity';
import { ensureSignedGuestIdentity } from '@/lib/guest-identity';
import { useSignedGuestId } from '@/hooks/persistence/useSignedGuestId';
import { untitledNameForTemplate, type TemplateKind } from '@livedoc/templates';
import {
  WIZARD_BYPASS_PARAMS,
  choosePlacementAgainUrl,
  placementParamsFromSearch,
  wizardBypassKind,
  wizardBypassTabKind,
  wizardPresetMode,
  wizardPresetQuery,
  wizardStartsBlank,
} from '@/lib/new-document-params';
import { backOutTarget } from '@/lib/back-out';
import { useLatest } from '@/hooks/ui/useLatest';
import { debugLog } from '@/lib/debug-log';
import { handStartQuery } from '@/components/start/start-query';
import { openStartForModeChoice } from '@/components/start/open-start-for-mode-choice';
import { handTemplatePick } from '@/lib/placement-defaults/template-pick-handoff';
import { isBlankTemplate } from '@livedoc/templates';
import { loadNewDocumentContent } from '@/lib/new-document/new-document-content-loader';
import { fetchAheadForNamedDocument } from './named-document-ahead';
import { prefetchWhenIdle } from '@/lib/idle-prefetch';
import { NEW_DOCUMENT_THEME_ID } from '@/lib/new-document/new-document-theme';
import { textDocumentContent } from '@/lib/text-document/text-document-content';
import { noteTextDocumentMade } from '@/lib/text-document/text-document-made';
import { UNTITLED_TEXT_DOCUMENT } from '@/lib/text-document/text-document-tab';
import { loadEditorPage } from '@/lib/editor-page-loader';
import { loadCanvasCode } from '@/lib/canvas-code/canvas-code';
import { UNTITLED_SPREADSHEET } from '@/lib/spreadsheet/spreadsheet-name';
import { trackNewDocumentCreated, writeNewDocument } from '@/lib/new-document/write-new-document';

// In-place handoff (docs/specs/007-editor/new-document-route.md): once a document is created, this page
// renders the editor itself under the rewritten /document/<id> URL instead of paying for a second page
// load. `loadEditorPage` (lib/editor-page-loader.ts) is also called on mount to fetch the chunk ahead; if it
// still isn't in at handoff, the opening screen holds at its "opening" stage.
const EditorPage = dynamic(loadEditorPage, {
  ssr: false,
  loading: () => <OpeningScreen />,
});

// The wizard bypass a /new URL asks for, if any (docs/specs/007-editor/new-document-route.md). The URL does
// not change under the page, so nothing needs to subscribe.
const subscribeNever = () => () => {};
const bypassKindFromUrl = () => wizardBypassKind(window.location.search);
// The template step's presets (`?mode=`, `?q=`), read the same way.
const presetModeFromUrl = () => wizardPresetMode(window.location.search);
const presetQueryFromUrl = () => wizardPresetQuery(window.location.search);
const noPreset = () => null;
const noBypass = () => null;

// What makes the document (the template builders, about 280 KiB gzipped) stays out of this page's first load, so the
// wizard shows sooner; a link that names a document to make fetches it, and the editor's code, as this code first runs.
fetchAheadForNamedDocument();

// Dedicated welcome / create-new flow, see docs/specs/007-editor/new-document-route.md.
// Owns identity bootstrap, the mode choice (a one-step wizard),
// and the actual "commit a new document" handoff. Once the user picks (or
// skips), we POST the seeded document and navigate to /document/<id> where
// the editor route picks it up cleanly. The Explorer is NOT rendered here:
// the wizard's "Open Existing Document" button sends users to /explorer
// instead, keeping this screen focused on creating.
const PENDING_SELF: Participant = {
  id: 'pending',
  name: 'Guest',
  color: '#0ea5e9',
  status: 'online',
};

export default function NewDocumentPage() {
  // Stable placeholder so the first paint matches the SSG render; the
  // real participant lands once the identity has resolved.
  // Account wiring (token provider + guest to authed migration), the same
  // hook as the editor route; see hooks/useAccountApiBootstrap.ts.
  const { authLoaded, accountId } = useAccountApiBootstrap();

  // Who is creating (docs/specs/003-system-architecture/react-state-and-effects.md): derived during render.
  // The base is the account id once auth has settled, else the guest id read from its store, with a name and
  // colour seeded once per visit. `selfOverride` holds what replaces it: the stored profile, the name
  // chosen in the wizard, or the commit's fallback. Until auth settles it is the 'pending' placeholder.
  // A guest's id is the SIGNED one, resolved before any owner-scoped call
  // (docs/specs/014-identity/auth-and-guest-access.md "Signed guest ids"): until then `self` stays
  // 'pending', which gates every owner-scoped read below.
  const guestId = useSignedGuestId(authLoaded, accountId);
  const [seed] = useState(() => ({ name: randomName(), color: randomColor() }));
  const [selfOverride, setSelf] = useState<Participant | null>(null);
  const baseId = authLoaded ? (accountId ?? guestId) : null;
  const self: Participant =
    selfOverride && (baseId === null || selfOverride.id === baseId)
      ? selfOverride
      : baseId
        ? { id: baseId, name: seed.name, color: seed.color, status: 'online' }
        : PENDING_SELF;
  const [submitting, setSubmitting] = useState(false);
  // Set once the created document has been handed to the in-place editor. The ref mirrors it for the
  // bfcache listener, which must stand down once this document IS the editor.
  const [openedId, setOpenedId] = useState<string | null>(null);
  const handedOff = useRef(false);
  // Set when the create fails: the card's copy and action (create-failure.ts). Shows instead of
  // navigating to the editor for a document that was never persisted (which would 404). The ref
  // keeps the last attempt's args so Retry can re-run the exact same create.
  const [createError, setCreateError] = useState<CreateFailure | null>(null);
  // Set by Skip and the bypass links: the new tab opens with its start closed. Unset, the mode choice opens it
  // (openStartForModeChoice).
  const explicitBlank = useRef(false);
  const lastCreateArgs = useRef<{
    kind: TemplateKind | null;
    // string, not ThemeId: the picker can hand back a custom `custom:<uuid>`
    // theme id (docs/specs/011-theme/custom-themes.md) as well as a built-in one.
    // Where it goes (new-document-settings.ts): store and placement, decided at commit.
    settings: NewDocumentSettings;
    // The ids it wrote under, reused by its Retry (createIdsFor).
    ids: CreateIds;
  } | null>(null);

  // Landing funnel (docs/specs/019-marketing/landing-funnel.md): the public-page CTA that brought this visit
  // here, if any. Counts the arrival now and the document once it's committed.
  const cta = useCtaAttribution();

  // Wizard bypass (docs/specs/007-editor/new-document-route.md): /new?blank=1 ("Start Blank") and
  // /new?template=<kind> (the marketing template gallery) skip the wizard
  // entirely — the page commits that template (Default theme, the template's
  // default name) the moment it mounts and lands on the editor. The ?folder /
  // ?team placement context still applies (placementParams).
  //
  // Read from the URL as an external store whose server snapshot is "no
  // bypass", NOT a window-reading state initializer: the static export
  // prerenders this page without a query string, so the hydration render has
  // to match the server HTML. The kind lands on the render after hydration;
  // until then the inline script + style guard rendered below keeps the
  // wizard hidden. That guard can't validate a template kind, so when the
  // query names one we don't know, the layout effect lifts it before the
  // first post-hydration paint and the wizard shows as normal.
  const bypassKind = useSyncExternalStore(subscribeNever, bypassKindFromUrl, noBypass);
  // Where a new document is stored: This Browser for a guest (docs/specs/006-document/save-locations.md), decided at
  // commit.
  const { resolveSaveLocation } = useNewDocumentLocation({ authLoaded, accountId });
  useLayoutEffect(() => {
    if (!bypassKindFromUrl()) document.documentElement.removeAttribute('data-just-draw');
  }, []);

  // `?mode=` / `?q=` (docs/specs/007-editor/new-document-route.md): the template step opens
  // narrowed. The prerendered step is unfiltered, so the wizard card stays hidden (the pre-paint
  // `data-wizard-preset` flag) until the render that shows the preset.
  const presetMode = useSyncExternalStore(subscribeNever, presetModeFromUrl, noPreset);
  const presetQuery = useSyncExternalStore(subscribeNever, presetQueryFromUrl, noPreset);
  useLayoutEffect(() => {
    if (presetModeFromUrl() === presetMode && presetQueryFromUrl() === presetQuery) {
      document.documentElement.removeAttribute('data-wizard-preset');
    }
  }, [presetMode, presetQuery]);

  const backOut = () => {
    if (submitting || preparing) return;
    const target = backOutTarget({
      referrer: document.referrer,
      origin: window.location.origin,
      historyLength: window.history.length,
    });
    debugLog(`[new] back out ${target}`);
    track('UI', 'Closed', 'NewDocument');
    if (target === 'back') window.history.back();
    else window.location.assign('/');
  };

  useEffect(() => {
    document.title = 'New Document | LiveDoc';
    // Fetch the editor's chunk while identity + the create run. Fire-and-forget: a failure here
    // just leaves `dynamic` to retry the import at handoff.
    loadEditorPage().catch(() => {});
    // A document of a canvas kind opens on the canvas, whose code is its own chunk: fetched alongside
    // (docs/specs/006-document/kinds-outside-the-canvas.md "The canvas's code"); a text document or a spreadsheet never.
    if (wizardBypassTabKind(window.location.search) === null) void loadCanvasCode('open');
    // The wizard has shown: what makes the document is fetched while the page is idle, ahead of a choice.
    return prefetchWhenIdle([loadNewDocumentContent]);
  }, []);

  // Back/forward-cache restore: creating navigates away with
  // `submitting === true` still set, and the browser Back button
  // restores this page from bfcache exactly as frozen — leaving the
  // Create button stuck on "Creating…" forever. `pageshow` with
  // `persisted` is the restore signal; reset the transient submit
  // state so the page is usable again.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted || handedOff.current) return;
      // A bypass auto-creates on mount, so a bfcache restore would
      // either strand the user on a frozen "Creating…" card or (if we
      // re-fired the create) trap Back behind a page that always navigates
      // forward again. Send them to the wizard instead, keeping the
      // ?folder / ?team placement context and dropping only the blank flag.
      if (bypassKind) {
        const params = new URLSearchParams(window.location.search);
        for (const key of WIZARD_BYPASS_PARAMS) params.delete(key);
        const qs = params.toString();
        window.location.replace(qs ? `/new?${qs}` : '/new');
        return;
      }
      setSubmitting(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [bypassKind]);

  useLayoutEffect(() => {
    // Wait for the session to settle so guest vs signed-in is known.
    if (!authLoaded) return;
    // Daily-active-returns signal (docs/specs/017-telemetry/telemetry.md): once-per-browser-per-UTC-day,
    // gated inside the helper.
    trackDailyReturn(!!accountId);
  }, [authLoaded, accountId]);
  // The stored profile, once the id is known: the account's, or a guest's signed one.
  const selfId = authLoaded ? (accountId ?? guestId) : null;
  useEffect(() => {
    if (!selfId) return;
    const local: Participant = { id: selfId, name: seed.name, color: seed.color, status: 'online' };
    let cancelled = false;
    void (async () => {
      const stored = await apiLoadSelf(selfId).catch(() => null);
      if (cancelled) return;
      if (stored) {
        setSelf({ ...stored, status: 'online' });
      } else {
        await apiSaveSelf(local).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selfId, seed]);
  // Identity for the commit path. The session read is asynchronous, so a fast
  // click-through (or an e2e robot) can reach Create while `self` is still
  // the 'pending' placeholder — the identity bootstrap above hasn't run.
  // Creating then would file the document under the literal owner "pending":
  // a shared id every raced visitor collides on, and one the editor route
  // (fetching with the real id) 404s. So the commit resolves identity
  // itself: wait out the bootstrap (bounded — authLoaded flips by the
  // 5 s session timeout at the latest), then fall back to the guest id.
  const selfRef = useLatest(self);
  const resolveSelf = async (): Promise<Participant> => {
    const deadline = Date.now() + 8000;
    while (selfRef.current.id === 'pending' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (selfRef.current.id !== 'pending') return selfRef.current;
    // Still pending (auth never settled): resolve the guest's signed id here.
    const fallback = { ...selfRef.current, id: (await ensureSignedGuestIdentity()).id };
    setSelf(fallback);
    return fallback;
  };

  // Single commit point, shared by a mode chosen, Create, Skip and the bypass links. Every new document starts on the
  // Default theme; either way we persist the document so the editor route lands on a real row.
  const themeId = NEW_DOCUMENT_THEME_ID;
  const commitNewDocument = async (
    templateKind: TemplateKind | null,
    asked: NewDocumentSettings,
    // Set by Retry: the failed attempt's ids, so a create that did land is not made twice.
    retrying: CreateIds | null = null,
  ) => {
    if (submitting) return;
    setSubmitting(true);
    // A `?q=` preset becomes the search in the new document's start panel (start-query.ts).
    handStartQuery(presetQuery);
    // A text document (`?kind=text-document`) and a spreadsheet (`?kind=spreadsheet`) go where any document goes
    // (docs/specs/034-text-documents/live-editing-and-storage.md "Offline", docs/specs/029-sheets/sheet-store.md
    // "Offline documents").
    // The kind the wizard's card chose, else the address's.
    const tabKind = chosenKind.current ?? wizardBypassTabKind(window.location.search);
    const textDocument = tabKind === 'text-document';
    const spreadsheet = tabKind === 'spreadsheet';
    const settings: NewDocumentSettings = asked;
    // Save location (docs/specs/006-document/save-locations.md): only This Browser takes the offline branch.
    const offline = isOfflineLocation(settings.saveLocation);
    const { documentId, tabId } = createIdsFor(retrying);
    // The mode choice asked for templates next, so its blank opens on its start; an explicit blank (Skip, Start
    // Blank, a blank's link) opens closed, as every empty tab does (docs/specs/007-editor/start-diagramming.md).
    if (!explicitBlank.current) openStartForModeChoice(tabId, templateKind);
    // A mode's blank in the cloud: the template picked later on its start screen may move it to that template's
    // default folder (docs/specs/013-workspace/default-folders.md "A template picked after creation").
    handTemplatePick(
      !offline && templateKind && isBlankTemplate(templateKind)
        ? { documentId, tabId, placementChosen: settings.placementChosen === true }
        : null,
    );
    // A Retry re-runs the create, not the preference write below.
    lastCreateArgs.current = { kind: templateKind, settings, ids: { documentId, tabId } };
    // Named after its template ("Untitled Diagram"); renamed in the editor.
    const documentName = textDocument
      ? UNTITLED_TEXT_DOCUMENT
      : spreadsheet
        ? UNTITLED_SPREADSHEET
        : untitledNameForTemplate(templateKind);
    markNameConfirmed();
    // Never create as the 'pending' placeholder — see resolveSelf above.
    const settleIdentity = resolveSelf;
    // Every step runs inside one attempt (create-failure.ts): signing the guest id and loading a template's seeds
    // can fail as the write can, and each must reach the error card, never leave /new on "Creating" for good.
    const attempt = await attemptCreate(async () => {
      // A document in This Browser has no owner on the server to wait for (docs/specs/006-document/offline-mode.md
      // "Instant open"): identity settles in the background while it opens. A cloud create needs the owner.
      if (offline) {
        void settleIdentity().catch((err: unknown) =>
          debugLog(`[new] background identity failed: ${String(err)}`),
        );
      }
      // The template's tabs, card types and example cards, or one blank tab (lib/new-document-content.ts).
      const { newDocumentContent } = await loadNewDocumentContent();
      // A text document made here starts in its maker's default styles when it first opens (text-and-paragraphs.md).
      if (textDocument) noteTextDocumentMade(tabId);
      const content = textDocument
        ? textDocumentContent(tabId, documentName)
        : spreadsheet
          ? // The engine's id and layout helpers load only for a spreadsheet.
            (await import('@/lib/spreadsheet/spreadsheet-document')).spreadsheetDocumentContent(
              tabId,
            )
          : await newDocumentContent({ templateKind, themeId, tabId, via: 'new' });
      // One create for both stores (lib/new-document/write-new-document.ts). Placement is passed through as given:
      // absent is no choice (a default folder may answer), a null folder the root chosen on purpose.
      await writeNewDocument({
        ids: { documentId, tabId },
        name: documentName,
        templateKind,
        content,
        location: settings.saveLocation,
        creator: offline ? async () => selfRef.current : settleIdentity,
        teamId: settings.teamId,
        folderId: settings.folderId,
      });
    });
    if (!attempt.ok) {
      // Create FAILED (identity, a template's seeds, network / 5xx / a refused placement for cloud, or no IndexedDB
      // for offline). Don't navigate to an editor for a document that was never persisted (that lands on a 404).
      // Surface the error card instead: Retry re-runs this exact create from lastCreateArgs; a refused placement
      // offers another place.
      debugLog(`[new] create failed action=${attempt.failure.action}`);
      setSubmitting(false);
      setCreateError(attempt.failure);
      return;
    }
    // Anonymous telemetry (docs/specs/017-telemetry/telemetry.md): a document was created (write-new-document.ts).
    trackNewDocumentCreated({
      location: settings.saveLocation,
      templateKind,
      teamId: settings.teamId,
    });
    if (textDocument) track('Document', 'Created', 'TextDocument');
    if (spreadsheet) track('Spreadsheet', 'Created', 'Blank');
    cta.trackCreated();
    // Hand off in place: the editor URL takes /new's history entry, and the editor mounts here,
    // reading the id from the rewritten path exactly as a direct visit would.
    handedOff.current = true;
    document.documentElement.removeAttribute('data-just-draw');
    window.history.replaceState(null, '', `/document/${documentId}`);
    setOpenedId(documentId);
  };

  // Every create from /new goes where new documents go by default (docs/specs/007-editor/new-document-route.md
  // "One-step wizard"): the store for who is creating, decided now (a guest at once, a signed-in browser once identity
  // settles), and the /new?folder= / ?team= context when there is one; without one it carries no placement, so a
  // default folder may answer (docs/specs/013-workspace/default-folders.md "Precedence"). `blank` opens it with its
  // start closed (Skip, Start Blank, a blank's link). The ref holds a second choice off while the store resolves.
  const [preparing, setPreparing] = useState(false);
  const creating = useRef(false);
  // Set when a default create failed before it reached commitNewDocument: its Retry starts it again.
  const retryDefaultCreate = useRef<(() => void) | null>(null);
  // A document kind chosen on the wizard's step (new-document-route.md "Choosing a mode"): made as `?kind=` makes it.
  const chosenKind = useRef<'text-document' | 'spreadsheet' | null>(null);
  // PDF document, blank or from a file: stored, then opened; what fails is the error card's, Try Again making it again.
  const createPdf = (source: NewPdfSource) =>
    void makeNewPdf(source, {
      search: window.location.search,
      ownerId: async () => (await resolveSelf()).id,
      location: () => {
        const { folderId, teamId } = placementParamsFromSearch(window.location.search);
        return attemptCreate(() => resolveSaveLocation(!!(folderId || teamId), resolveSelf));
      },
      go: (href) => window.location.assign(href),
      fail: (failure) => {
        retryDefaultCreate.current = () => createPdf(source);
        setCreateError(failure);
      },
    });
  const createByDefault = async (kind: TemplateKind, blank: boolean) => {
    if (creating.current || submitting) return;
    creating.current = true;
    setPreparing(true);
    const placement = placementParamsFromSearch(window.location.search);
    const placed = !!(placement.folderId || placement.teamId);
    try {
      // Deciding the store can settle identity, which can fail: that failure reaches the error card too, and its
      // Retry decides again (docs/specs/007-editor/new-document-route.md "Every step of the create can fail").
      const located = await attemptCreate(() => resolveSaveLocation(placed, resolveSelf));
      if (!located.ok) {
        debugLog(`[new] save location failed action=${located.failure.action}`);
        retryDefaultCreate.current = () => void createByDefault(kind, blank);
        setCreateError(located.failure);
        return;
      }
      retryDefaultCreate.current = null;
      explicitBlank.current = blank;
      await commitNewDocument(kind, {
        saveLocation: located.value,
        ...placement,
        placementChosen: placed,
      });
    } finally {
      creating.current = false;
      setPreparing(false);
    }
  };

  // Start Blank fast path (docs/specs/007-editor/new-document-route.md): fire the Skip-defaults create on mount.
  // commitNewDocument waits out the identity bootstrap itself (resolveSelf),
  // so firing immediately is safe. The ref makes it once-only under Strict
  // Mode's double-invoked effects.
  const bypassFired = useRef(false);
  const fireBypass = useEffectEvent((kind: TemplateKind) => {
    // Wizard-bypass adoption signal (docs/specs/017-telemetry/telemetry.md): a fixed preset per entry
    // point, never user content. (The template itself is reported by the
    // usual Document / Created event the commit fires.)
    track('UI', 'Used', kind === 'blank' ? 'JustDraw' : 'TemplateLink');
    // `?kind=pdf-document` makes a Blank PDF, a stored file rather than a blank tab.
    if (wizardBypassTabKind(window.location.search) === 'pdf-document') return createPdf('blank');
    void createByDefault(kind, true);
  });
  useEffect(() => {
    if (!bypassKind || bypassFired.current) return;
    bypassFired.current = true;
    fireBypass(bypassKind);
  }, [bypassKind]);

  // Keyed on the id so a second handoff (not reachable today) would remount a fresh editor.
  if (openedId) return <EditorPage key={openedId} />;

  if (createError) {
    return (
      <div className="flex h-dvh flex-col">
        <main className="relative flex-1 bg-slate-50 dark:bg-slate-950">
          <StatusTopLine />
          <ApiErrorPage
            eyebrow={createError.eyebrow}
            title={createError.title}
            message={createError.message}
            retryLabel={createError.actionLabel}
            onRetry={() => {
              if (createError.action === 'choose') {
                // The refused placement would be refused again: reopen the wizard without it.
                window.location.assign(choosePlacementAgainUrl(window.location.search));
                return;
              }
              setCreateError(null);
              const retryDefault = retryDefaultCreate.current;
              if (retryDefault) {
                retryDefaultCreate.current = null;
                retryDefault();
                return;
              }
              const a = lastCreateArgs.current;
              if (a) void commitNewDocument(a.kind, a.settings, a.ids);
            }}
          />
        </main>
      </div>
    );
  }

  // A bypass never shows the wizard: the opening screen, at its "creating" stage, holds the screen
  // from mount to the handoff (docs/specs/007-editor/new-document-route.md). The editor's own load
  // renders the same screen, so create → open reads as one moment. Create failures fall through to
  // the retryable error card branch before this one.
  if (bypassKind) return <DocumentLoading stage="creating" />;

  return (
    <div className="flex h-dvh flex-col">
      {/* Bypass pre-hydration guard (docs/specs/007-editor/new-document-route.md): this static page's
          prerendered HTML is the wizard, and React only learns about
          ?blank=1 / ?template= at hydration — without this, the wizard paints for the
          beat until then. The script runs as the HTML parses, BEFORE the
          wizard markup below paints, and flags the root element; the style
          rule hides the wizard-only content under that flag until React
          swaps in the opening screen. */}
      <script
        dangerouslySetInnerHTML={{
          __html: trustedHtml(
            "try{var p=new URLSearchParams(location.search);if(p.has('blank')||p.has('template')||p.get('kind')==='text-document'||p.get('kind')==='spreadsheet'||p.get('kind')==='pdf-document')document.documentElement.setAttribute('data-just-draw','');if(p.has('mode')||p.has('q'))document.documentElement.setAttribute('data-wizard-preset','')}catch(e){}",
          ),
        }}
      />
      <style>{`html[data-just-draw] [data-wizard-only],html[data-wizard-preset] [data-wizard-only]{visibility:hidden}`}</style>
      {/* A mode card chosen before hydration is kept, not lost (early-mode-choice.ts). */}
      <script dangerouslySetInnerHTML={{ __html: trustedHtml(EARLY_MODE_SCRIPT) }} />
      <style>{EARLY_MODE_STYLE}</style>
      <main className="relative flex-1 overflow-hidden bg-slate-50 dark:bg-slate-950">
        {/* Soft animated lines give the otherwise-empty backdrop life
            behind the wizard card. Decorative + reduced-motion aware. */}
        <AnimatedLinesBackdrop />
        <StatusTopLine />
        {/* No identity spinner: the wizard is static mode data, so it renders immediately; identity resolves in the
            background, and a create waits for it only when it must (resolveSelf). */}
        {/* display:contents so the guard wrapper adds no box of its own;
            visibility inherits to the wizard card. */}
        <div data-wizard-only className="contents">
          <NewDocumentWizard
            busy={submitting || preparing}
            initialMode={presetMode}
            // A mode chosen after a Start Blank link (`?start=blank`) opens its blank with the start closed.
            onCreate={(kind) =>
              void createByDefault(kind, wizardStartsBlank(window.location.search))
            }
            onCreateKind={(kind, source) => {
              if (kind === 'pdf-document') return createPdf(source);
              chosenKind.current = kind;
              void createByDefault('blank', true);
            }}
            onSkip={() => void createByDefault('blank', true)}
            onOpenExisting={() => window.location.assign('/explorer/recent')}
            // Escape backs out to the page that opened /new, creating nothing
            // (docs/specs/007-editor/new-document-route.md "Escape backs out").
            onBackOut={backOut}
          />
        </div>
        {/* The right rail beside the centred wizard (desktop-only, xl+):
            returning users get "Jump Back In" (docs/specs/007-editor/new-document-route.md, hidden with no
            documents yet). */}
        <div
          data-wizard-only
          className="pointer-events-none absolute inset-y-0 right-4 z-10 hidden items-center xl:flex 2xl:right-10"
        >
          <RecentDocumentsCard ownerId={self.id === 'pending' ? null : self.id} />
        </div>
      </main>
    </div>
  );
}
