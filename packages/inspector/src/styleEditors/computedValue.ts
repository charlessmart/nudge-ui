import { getElementComputedStyle } from "../domRealm.ts";

export function getComputedValue(el: HTMLElement, prop: string): string {
  const value = getElementComputedStyle(el).getPropertyValue(prop);
  return value.trim();
}

export interface ParsedLength {
  value: number;
  unit: string;
}

export function parseLength(raw: string): ParsedLength {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed === "auto" || trimmed === "none") return { value: 0, unit: "px" };
  const match = /^(-?\d*\.?\d+)(px|em|rem|%|pt|vw|vh|ex|ch|cm|mm|in)?$/i.exec(trimmed);
  if (!match) return { value: 0, unit: "px" };
  const num = Number(match[1]);
  const unit = match[2] ?? "";
  if (Number.isNaN(num)) return { value: 0, unit: "px" };
  return { value: num, unit: unit || "px" };
}

export function parsePxNumber(raw: string): number {
  return parseLength(raw).value;
}
