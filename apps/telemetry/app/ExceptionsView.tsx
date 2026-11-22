'use client';

import type { TelemetrySummary, TelemetryWindowKey } from '@livedoc/api-schema';
import { MetricGroups, type MetricGroup } from './MetricCards';
import { CardColumns } from './CardColumns';
import {
  isApiClientException,
  isDroppedConnection,
  isRecovery,
  isRefusal,
  isServerCrash,
  isServerFault,
} from './error-kinds';
import {
  CLIENT_EXCEPTIONS,
  DROPPED_CONNECTIONS,
  LOAD_RECOVERY,
  REALTIME_RESYNCS,
  REFUSALS,
  STALE_CHUNK_RELOADS,
  SERVER_CRASHES,
  SERVER_FAULTS,
} from './metric-catalogue';
import { RankCard, rank } from './RankCard';
import { rankTrend, windowLabel } from './windows';

// Exceptions section of the Health tab (docs/specs/017-telemetry/telemetry.md): error health, each row saying where it
// failed. API failures observed by the editor's api-client
// (`Error·Api·Http<status>.<Action>`, `Network.<Method>.<Route>`), server-side
// crashes the api worker self-reports (`Internal.<Method>.<Route>`), MCP
// failures by tool (`Http503.<Tool>`, `Internal.<Tool>`), and client-side
// exceptions from the editor + help centre
// (`Error·Client·Uncaught.<Page>.<ErrorName>`, `Render.<Area>.<ErrorName>`),
// and warnings (`Error·Warning·*`): a degradation the author was carried
// through, such as a spent AI budget failing over to the in-browser reader.
// Every count is generic by construction (statuses, route words, pages, areas
// and a closed list of error names), so there is nothing personal to show. An
// empty view is the goal state. Load Recovery (the repairs people ran) follows the rankings.
export { RECOVERY_TYPES, isRecovery, isServerCrash } from './error-kinds';

export const GROUPS: MetricGroup[] = [
  {
    title: 'Error volume',
    metrics: [
      SERVER_FAULTS,
      SERVER_CRASHES,
      REFUSALS,
      DROPPED_CONNECTIONS,
      CLIENT_EXCEPTIONS,
      REALTIME_RESYNCS,
      STALE_CHUNK_RELOADS,
    ],
  },
];

// After the rankings: how people got a broken load going again.
export const RECOVERY_GROUPS: MetricGroup[] = [{ title: 'Recovery', metrics: [LOAD_RECOVERY] }];

export function ExceptionsView({
  summary,
  active,
}: {
  summary: TelemetrySummary;
  active: TelemetryWindowKey;
}) {
  const rows = summary.windows[active].rows;
  const trend = rankTrend(summary, active);
  const isApi = (r: { category: string; action: string }) =>
    r.category === 'Error' && r.action === 'Api';
  // Every Error·Api row lands in exactly one ranking, as in the cards above (apiFailureCard).
  const faults = rank(rows, (r) => isApi(r) && isServerFault(r.type));
  const refusals = rank(rows, (r) => isApi(r) && isRefusal(r.type));
  const dropped = rank(rows, (r) => isApi(r) && isDroppedConnection(r.type));
  const crashes = rank(rows, (r) => isApi(r) && isServerCrash(r.type));
  const client = rank(
    rows,
    (r) =>
      r.category === 'Error' &&
      ((r.action === 'Client' && !isRecovery(r.type)) ||
        (r.action === 'Api' && isApiClientException(r.type))),
  );
  const warning = rank(rows, (r) => r.category === 'Error' && r.action === 'Warning');

  return (
    <div className="mt-8">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Error health for <span className="font-medium">{windowLabel(active)}</span>: what failed and
        where, counted generically (a status or kind plus the request, route, page, or area), never
        a message, stack, or anything personal. An empty view here is the goal.
      </p>
      <MetricGroups groups={GROUPS} summary={summary} active={active} />

      <div className="mt-6">
        <CardColumns>
          <RankCard
            trend={trend}
            title="Server Faults"
            subtitle="By status and the request, route, MCP tool or CLI command the server failed"
            category="Error"
            action="Api"
            items={faults}
            daily={summary.daily}
            emptyLabel="No server faults in this window. Good."
          />
          <RankCard
            trend={trend}
            title="Server Crashes"
            subtitle="By the route the api worker was serving when it threw"
            category="Error"
            action="Api"
            items={crashes}
            daily={summary.daily}
            emptyLabel="No server crashes in this window. Good."
          />
          <RankCard
            trend={trend}
            title="Refusals"
            subtitle="By status and the request the server said no to, with the reason it gave"
            category="Error"
            action="Api"
            items={refusals}
            daily={summary.daily}
            emptyLabel="No refusals in this window."
          />
          <RankCard
            trend={trend}
            title="Dropped Connections"
            subtitle="By the route, MCP tool or CLI command whose request never got an answer"
            category="Error"
            action="Api"
            items={dropped}
            daily={summary.daily}
            emptyLabel="No dropped connections in this window."
          />
          <RankCard
            trend={trend}
            title="Client Exceptions"
            subtitle="By kind, the page or editor area it happened in, and the error type"
            category="Error"
            action="Client"
            items={client}
            daily={summary.daily}
            emptyLabel="No client exceptions in this window. Good."
          />
          <RankCard
            trend={trend}
            title="Warnings"
            subtitle="Degradations the author was carried through, such as a spent AI budget reading on the device"
            category="Error"
            action="Warning"
            items={warning}
            daily={summary.daily}
            emptyLabel="No warnings in this window."
          />
        </CardColumns>
      </div>
      <MetricGroups groups={RECOVERY_GROUPS} summary={summary} active={active} />
    </div>
  );
}
