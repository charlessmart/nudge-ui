import { countInspectionWork } from "../../inspection/performanceDiagnostics.ts";

export interface ContainerQueryPair {
  element: HTMLElement;
  /** Outer-to-inner conditions, including container names. */
  conditions: readonly string[];
}

export interface ContainerQueryEvaluator {
  prefetch(pairs: readonly ContainerQueryPair[]): void;
  matches(element: HTMLElement, conditions: readonly string[]): boolean;
}

let nextProbeId = 0;

/**
 * Evaluates container conditions in batches for one inspection refresh.
 * Each pair gets its own property, so inherited probe values cannot answer
 * another element's query. No stylesheet or marker survives a batch.
 */
export function createContainerQueryEvaluator(doc: Document): ContainerQueryEvaluator {
  const results = new WeakMap<HTMLElement, Map<string, boolean>>();
  const key = (conditions: readonly string[]): string => JSON.stringify(conditions);

  function prefetch(pairs: readonly ContainerQueryPair[]): void {
    const pending: Array<ContainerQueryPair & { key: string; marker: string; property: string }> = [];
    for (const pair of pairs) {
      if (pair.element.ownerDocument !== doc) throw new TypeError("Container query target belongs to another document.");
      if (pair.conditions.length === 0) continue;
      let values = results.get(pair.element);
      if (!values) { values = new Map(); results.set(pair.element, values); }
      const conditionKey = key(pair.conditions);
      if (values.has(conditionKey)) continue;
      // Reserve the pair before collecting the rest of this batch.
      values.set(conditionKey, false);
      const id = ++nextProbeId;
      pending.push({ ...pair, key: conditionKey, marker: `data-container-probe-${id}`, property: `--nudge-container-probe-${id}` });
    }
    if (!doc.head || pending.length === 0) return;
    const sheet = doc.createElement("style");
    sheet.setAttribute("data-nudge-ui", "container-probe");
    sheet.textContent = pending.map(({ conditions, marker, property }) => {
      let rule = `[${marker}] { ${property}: 1 !important; }`;
      for (let index = conditions.length - 1; index >= 0; index--) {
        rule = `@container ${conditions[index]} { ${rule} }`;
      }
      return rule;
    }).join("\n");
    countInspectionWork(doc, "probePairs", pending.length);
    countInspectionWork(doc, "probeBatches");
    try {
      for (const pair of pending) pair.element.setAttribute(pair.marker, "");
      doc.head.append(sheet);
      const styles = new Map<HTMLElement, CSSStyleDeclaration>();
      for (const pair of pending) {
        let style = styles.get(pair.element);
        if (!style) {
          style = doc.defaultView?.getComputedStyle(pair.element);
          if (style) styles.set(pair.element, style);
        }
        results.get(pair.element)!.set(pair.key, style?.getPropertyValue(pair.property).trim() === "1");
      }
    } finally {
      sheet.remove();
      for (const pair of pending) pair.element.removeAttribute(pair.marker);
    }
  }

  return {
    prefetch,
    matches(element, conditions) {
      countInspectionWork(doc, "containerChecks");
      if (conditions.length === 0) return true;
      prefetch([{ element, conditions }]);
      return results.get(element)?.get(key(conditions)) ?? false;
    },
  };
}
