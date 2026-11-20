// The spreadsheet engine's Web Worker (docs/specs/029-sheets/formulas.md "Recalculation"): the only engine on the
// page. It takes the store's sheets and changes and answers with waiting cells and their values, working in parts
// of RECALC_SLICE_MS so a newer change is taken in between them, never behind a whole recalculation.
import { EngineHosts, RECALC_SLICE_MS, type FromEngine, type ToEngine } from './sheet-engine-hosts';

const scope = self as unknown as {
  postMessage: (message: FromEngine) => void;
  addEventListener: (type: 'message', fn: (e: MessageEvent<ToEngine>) => void) => void;
};

const hosts = new EngineHosts((m) => scope.postMessage(m));
let scheduled = false;

function part(): void {
  scheduled = false;
  if (hosts.work(RECALC_SLICE_MS)) schedule();
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(part, 0);
}

scope.addEventListener('message', (e) => {
  hosts.receive(e.data);
  schedule();
});
