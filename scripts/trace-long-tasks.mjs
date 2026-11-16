#!/usr/bin/env node
// Names what each long task in a Chromium trace is made of (docs/specs/016-platform/web-performance.md "Measuring"):
// every main-thread task over the threshold, its top-level work by kind (scripts, style, layout, paint, ...), and
// the JavaScript functions that held it longest, from the trace's CPU profile (self time, then the frame each ran
// under). Record a trace with the `disabled-by-default-v8.cpu_profiler` category, as
// apps/live/scripts/explorer-long-list-measure.mjs `--trace <dir>` does.
// Usage: node scripts/trace-long-tasks.mjs <trace.json> [threshold-ms=50] [functions-per-task=8]
import { readFileSync } from 'node:fs';

const [tracePath, thresholdArg = '50', topArg = '8'] = process.argv.slice(2);
if (!tracePath) {
  console.error('[trace-long-tasks] usage: trace-long-tasks.mjs <trace.json> [threshold-ms] [top]');
  process.exit(2);
}
const thresholdUs = Number(thresholdArg) * 1000;
const top = Number(topArg);
const raw = JSON.parse(readFileSync(tracePath, 'utf8'));
const events = Array.isArray(raw) ? raw : raw.traceEvents;

// The renderer main threads: every CrRendererMain (one per renderer process).
const mainThreads = new Set(
  events
    .filter((e) => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain')
    .map((e) => `${e.pid}:${e.tid}`),
);
const onMain = (e) => mainThreads.has(`${e.pid}:${e.tid}`);

const tasks = events
  .filter((e) => onMain(e) && e.ph === 'X' && e.name === 'RunTask' && e.dur >= thresholdUs)
  .sort((a, b) => a.ts - b.ts);

// Complete events on the main threads, for the per-task breakdown by kind.
const complete = events
  .filter((e) => onMain(e) && e.ph === 'X' && e.name !== 'RunTask')
  .sort((a, b) => a.ts - b.ts);

// The CPU profile: nodes and timed samples, per process and profile id.
const profiles = new Map();
for (const e of events) {
  if (e.name !== 'Profile' && e.name !== 'ProfileChunk') continue;
  const key = `${e.pid}:${e.id}`;
  let profile = profiles.get(key);
  if (!profile) {
    profile = { pid: e.pid, start: 0, nodes: new Map(), samples: [] };
    profiles.set(key, profile);
  }
  if (e.name === 'Profile') {
    profile.start = e.args.data.startTime;
    continue;
  }
  const data = e.args.data;
  for (const node of data.cpuProfile?.nodes ?? []) profile.nodes.set(node.id, node);
  const ids = data.cpuProfile?.samples ?? [];
  const deltas = data.timeDeltas ?? [];
  let t = profile.samples.at(-1)?.ts ?? profile.start;
  ids.forEach((id, i) => {
    t += deltas[i] ?? 0;
    profile.samples.push({ ts: t, id });
  });
}

function frameName(node) {
  const f = node?.callFrame;
  if (!f) return '(unknown)';
  const file = f.url ? f.url.split('/').pop() : '';
  const name = f.functionName || '(anonymous)';
  return file ? `${name} ${file}:${f.lineNumber + 1}:${f.columnNumber + 1}` : name;
}

// The nearest caller that is not a runtime or anonymous frame, so a hot leaf names what asked for it.
function callerOf(profile, node) {
  let parent = node.parent ? profile.nodes.get(node.parent) : undefined;
  while (parent && (!parent.callFrame?.functionName || !parent.callFrame?.url))
    parent = parent.parent ? profile.nodes.get(parent.parent) : undefined;
  return parent ? frameName(parent) : '';
}

for (const profile of profiles.values()) {
  for (const node of profile.nodes.values()) {
    for (const child of node.children ?? []) {
      const c = profile.nodes.get(child);
      if (c) c.parent = node.id;
    }
  }
}

const ms = (us) => (us / 1000).toFixed(1);
console.log(`${tasks.length} main-thread tasks over ${thresholdArg} ms in ${tracePath}`);
const totals = new Map();
for (const task of tasks) {
  const end = task.ts + task.dur;
  // Top-level children only: an event inside an earlier one in this task is already counted.
  const kinds = new Map();
  let coveredUntil = 0;
  for (const e of complete) {
    if (e.ts < task.ts || e.pid !== task.pid || e.tid !== task.tid) continue;
    if (e.ts >= end) break;
    if (e.ts < coveredUntil) continue;
    coveredUntil = e.ts + e.dur;
    const label =
      e.name === 'FunctionCall' || e.name === 'EvaluateScript' || e.name === 'v8.callFunction'
        ? `${e.name} ${(e.args?.data?.url ?? '').split('/').pop()}`.trim()
        : e.name;
    kinds.set(label, (kinds.get(label) ?? 0) + e.dur);
  }
  const selfTime = new Map();
  for (const profile of profiles.values()) {
    if (profile.pid !== task.pid) continue;
    const samples = profile.samples;
    for (let i = 0; i < samples.length - 1; i++) {
      const s = samples[i];
      if (s.ts < task.ts || s.ts >= end) continue;
      const node = profile.nodes.get(s.id);
      const name = frameName(node);
      if (name === '(idle)' || name === '(root)') continue;
      const label = `${name}  <- ${callerOf(profile, node)}`;
      selfTime.set(label, (selfTime.get(label) ?? 0) + (samples[i + 1].ts - s.ts));
    }
  }
  const kindList = [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 6);
  for (const [k, v] of kinds) totals.set(k, (totals.get(k) ?? 0) + v);
  console.log(
    `\n- task at ${ms(task.ts - tasks[0].ts)} ms: ${ms(task.dur)} ms\n  by kind: ${kindList
      .map(([k, v]) => `${k} ${ms(v)}`)
      .join(', ')}`,
  );
  for (const [name, us] of [...selfTime].sort((a, b) => b[1] - a[1]).slice(0, top))
    console.log(`    ${ms(us).padStart(6)} ms  ${name}`);
}
if (tasks.length > 1) {
  console.log('\nAll long tasks, by kind:');
  for (const [k, v] of [...totals].sort((a, b) => b[1] - a[1]).slice(0, 12))
    console.log(`  ${ms(v).padStart(8)} ms  ${k}`);
}
