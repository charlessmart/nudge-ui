import { expect } from "@playwright/test";

export const RECORD_MODE = process.env.PERF_RECORD_BASELINE === "1";

export interface MetricResult {
  median: number;
  runs: number[];
  budget: number;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function logRow(key: string, result: MetricResult): void {
  console.log(`perf | ${key.padEnd(14)} | median ${result.median.toFixed(1).padStart(8)}ms | budget ${result.budget}ms | runs [${result.runs.map((r) => r.toFixed(1)).join(", ")}]`);
}

export function checkBudget(key: string, result: MetricResult): void {
  if (RECORD_MODE) return;
  expect(
    result.median,
    `${key}: median ${result.median.toFixed(1)}ms exceeds budget ${result.budget}ms (runs: ${result.runs.map((r) => r.toFixed(1)).join(", ")})`,
  ).toBeLessThan(result.budget);
}
