type Interaction = "selection" | "hover" | "drag" | "idle";
type Counter = "inspections" | "refreshes" | "containerChecks" | "probePairs" | "probeBatches";
type Counts = Record<Counter, number>;

interface InspectionPerformanceDiagnostics {
  read(): Record<Interaction, Counts>;
  reset(): void;
  dispose(): void;
}

declare global {
  interface Window {
    __nudgeUiPerformance?: InspectionPerformanceDiagnostics;
  }
}

const counters = new WeakMap<Document, (counter: Counter, count: number) => void>();

/** Records work only when diagnostics are explicitly enabled for a document. */
export function countInspectionWork(doc: Document, counter: Counter, count = 1): void {
  counters.get(doc)?.(counter, count);
}

/** Groups asynchronous inspection work by the most recent pointer gesture. */
export function enableInspectionPerformanceDiagnostics(doc: Document): void {
  const view = doc.defaultView;
  if (!view || view.__nudgeUiPerformance) return;
  let interaction: Interaction = "idle";
  const empty = (): Counts => ({ inspections: 0, refreshes: 0, containerChecks: 0, probePairs: 0, probeBatches: 0 });
  let counts = { idle: empty(), selection: empty(), hover: empty(), drag: empty() };
  const move = (event: PointerEvent): void => { interaction = event.buttons ? "drag" : "hover"; };
  const select = (): void => { interaction = "selection"; };
  doc.addEventListener("pointermove", move, true);
  doc.addEventListener("pointerdown", select, true);
  doc.addEventListener("click", select, true);
  counters.set(doc, (counter, count) => { counts[interaction][counter] += count; });
  view.__nudgeUiPerformance = {
    read: () => structuredClone(counts),
    reset() { counts = { idle: empty(), selection: empty(), hover: empty(), drag: empty() }; },
    dispose() {
      doc.removeEventListener("pointermove", move, true);
      doc.removeEventListener("pointerdown", select, true);
      doc.removeEventListener("click", select, true);
      counters.delete(doc);
      delete view.__nudgeUiPerformance;
    },
  };
}
