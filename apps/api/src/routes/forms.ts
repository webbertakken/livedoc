// /api/forms/:code: a form link's public doors (docs/specs/030-forms/forms.md "Filling in a form"). Anyone with the
// code reads the form and sends a response; nothing here reads or answers the document itself. Every miss (unknown,
// suspended, trashed, tab gone) is the same 404, so a code tells nobody what lies behind it.
import {
  FORM_REPORT_NOTE_MAX,
  FORM_REPORT_REASONS,
  type FormReportReason,
  type PublicFormResponse,
} from '@livedoc/api-schema';
import { formLook } from '@livedoc/document';
import { FORM_CODE_PATTERN, closedMessageOf, closedReason, publicForm } from '@livedoc/forms';
import { typesOf } from '@livedoc/items';
import { clientIp, clientNetwork } from '../client-ip';
import { addFormReport, countSuspendedFormLinks, getFormLink, suspendFormLink } from '../db';
import { notifyFormSuspended } from '../email/notifications';
import { responsesProblem } from '../forms/form-tab';
import { reportServerEvent } from '../server-telemetry';
import { openFormLink, respond } from '../forms/respond';
import { json, methodNotAllowed, notFound } from '../responses';
import { readOptionalBody, type DocumentRouteContext, type RouteContext } from './context';
import { askRoom, documentRoom } from '../document-room/document-client';
import { identityOf } from '../document-room/document-route';

const REASON_TYPES: Record<FormReportReason, string> = {
  spam: 'Spam',
  phishing: 'Phishing',
  offensive: 'Offensive',
  other: 'Other',
};

// Reports from this many distinct networks suspend a link for good.
const FORM_REPORTS_TO_SUSPEND = 3;
const BROWSER_ID = /^[A-Za-z0-9-]{8,64}$/;

const formNotFound = () => json({ error: 'form_not_found' }, { status: 404 });

async function read(ctx: DocumentRouteContext, code: string): Promise<Response> {
  const opened = await openFormLink(ctx, code);
  if (!opened) return formNotFound();
  const { link, doc, form, tab } = opened;
  const look = formLook(tab);
  let closed = closedReason(form, {
    open: link.open === 1,
    responses: link.responses,
    now: Date.now(),
  });
  // A destination broken since publishing shows as closed: a response could not be made.
  if (!closed && (await responsesProblem(ctx.env, doc.id, tab.id, form, typesOf(doc.itemTypes))))
    closed = 'no_destination';
  const body: PublicFormResponse = closed
    ? {
        state: 'closed',
        heading: form.heading,
        message: closedMessageOf(form),
        look,
      }
    : { state: 'open', form: publicForm(form), look };
  // Never cached: a form edited, closed or deleted shows as it is now.
  return json(body, { headers: { 'Cache-Control': 'no-store' } });
}

async function fileReport(ctx: DocumentRouteContext, code: string): Promise<Response> {
  const opened = await openFormLink(ctx, code);
  if (!opened) return formNotFound();
  const body = await readOptionalBody(ctx.request);
  if (body instanceof Response) return body;
  const reason = body['reason'];
  const browser = body['browser'];
  if (
    !FORM_REPORT_REASONS.includes(reason as FormReportReason) ||
    typeof browser !== 'string' ||
    !BROWSER_ID.test(browser)
  )
    return json({ error: 'invalid_report' }, { status: 400 });
  const note =
    typeof body['note'] === 'string' && body['note'].trim()
      ? body['note'].trim().slice(0, FORM_REPORT_NOTE_MAX)
      : null;
  const now = Date.now();
  const { added, distinct } = await addFormReport(
    ctx.env,
    {
      code,
      browser,
      network: clientNetwork(clientIp(ctx.request)),
      reason: reason as string,
      note,
    },
    now,
  );
  if (added) {
    console.info('[forms] form.reported', { documentId: opened.doc.id, reason });
    // The reason is a preset value (FORM_REPORT_REASONS), never the note.
    const { env } = ctx;
    const type = REASON_TYPES[reason as FormReportReason];
    ctx.waitUntil?.(reportServerEvent(env, 'Form', 'Reported', type));
  }
  if (distinct >= FORM_REPORTS_TO_SUSPEND && (await suspendFormLink(ctx.env, code, now))) {
    const suspensions = await countSuspendedFormLinks(ctx.env, opened.doc.id);
    console.warn('[forms] form.suspended', { documentId: opened.doc.id, suspensions });
    ctx.waitUntil?.(
      notifyFormSuspended(
        ctx.env,
        { id: opened.doc.id, ownerId: opened.doc.ownerId, name: opened.doc.name },
        opened.form.heading,
      ),
    );
  }
  return json({ ok: true }, { status: 201 });
}

type FormDoor = 'read' | 'respond' | 'report';

// Which door a request knocks on, or the answer for one that is no door.
function formDoor(segments: readonly string[], method: string): FormDoor | Response {
  if (segments.length === 3) return method === 'GET' ? 'read' : methodNotAllowed();
  if (segments.length === 4 && segments[3] === 'responses')
    return method === 'POST' ? 'respond' : methodNotAllowed();
  if (segments.length === 4 && segments[3] === 'reports')
    return method === 'POST' ? 'report' : methodNotAllowed();
  return notFound();
}

// A public form's doors in the worker: the link names its document, whose room answers (respondToForm), as the form
// is that document's tab. An unknown code, or a code that cannot be one, is answered here as any missing form is.
export async function handleForms(ctx: RouteContext): Promise<Response> {
  const { segments, request, env } = ctx;
  const code = segments[2] ?? '';
  if (!code) return notFound();
  const door = formDoor(segments, request.method);
  if (door instanceof Response) return door;
  const link = FORM_CODE_PATTERN.test(code) ? await getFormLink(env, code) : null;
  if (!link) return formNotFound();
  return askRoom(request, () =>
    documentRoom(env, link.document_id).respondToForm(request, identityOf(ctx)),
  );
}

// The doors themselves, inside the form's document's room.
export async function answerFormRequest(ctx: DocumentRouteContext): Promise<Response> {
  const { segments, request } = ctx;
  const code = segments[2] ?? '';
  const door = formDoor(segments, request.method);
  if (door instanceof Response) return door;
  if (!FORM_CODE_PATTERN.test(code)) return formNotFound();
  if (door === 'read') return read(ctx, code);
  if (door === 'respond') return respond(ctx, code);
  return fileReport(ctx, code);
}
