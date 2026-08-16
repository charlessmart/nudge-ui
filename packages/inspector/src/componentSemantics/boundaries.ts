import type {
  ComponentPropBaseline,
  ComponentPropValue,
} from "./types.ts";

function isPropValue(value: unknown): value is ComponentPropValue {
  return typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean";
}

export function componentPropBaseline(value: unknown): ComponentPropBaseline {
  return isPropValue(value)
    ? { kind: "value", value }
    : { kind: "default" };
}
