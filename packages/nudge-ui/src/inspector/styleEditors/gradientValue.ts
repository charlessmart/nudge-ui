import { splitTopLevel, splitTopLevelWhitespace } from "../../css/value-semantics/cssSyntax.ts";

export type GradientType = "linear" | "radial" | "conic";
export interface GradientStop { color: string; position: number }
export interface GradientValue {
  type: GradientType;
  repeating: boolean;
  angle: number;
  /** Preserve the computed shape, origin, and interpolation method. */
  prelude: string;
  stops: GradientStop[];
}

export function defaultGradient(): GradientValue {
  return { type: "linear", repeating: false, angle: 90, prelude: "", stops: [
    { color: "#dddddd", position: 0 }, { color: "#a4a4a4", position: 100 },
  ] };
}

function angleDegrees(value: string): number | null {
  const match = /^([+-]?(?:\d*\.)?\d+)(deg|grad|rad|turn)$/.exec(value);
  if (!match) return null;
  const number = Number(match[1]);
  switch (match[2]) {
    case "grad": return number * 0.9;
    case "rad": return number * 180 / Math.PI;
    case "turn": return number * 360;
    default: return number;
  }
}

/** Parse editable computed gradients. Leave unsupported syntax in the CSS field. */
export function parseGradient(value: string): GradientValue | null {
  if (splitTopLevel(value, ",").length !== 1) return null;
  const match = /^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/s.exec(value.trim());
  if (!match) return null;
  const type = match[2] as GradientType;
  const parts = splitTopLevel(match[3]!, ",").map((part) => part.trim());
  let prelude = "";
  let angle = type === "linear" ? 180 : 0;
  const first = parts[0] ?? "";
  if (/^(?:to\s|[+-]?(?:\d*\.)?\d+(?:deg|grad|rad|turn)\b|circle\b|ellipse\b|closest-|farthest-|at\s|from\s|in\s)/.test(first)
    || (type === "radial" && /\b(?:px|%)\b/.test(first))) {
    prelude = parts.shift()!;
    if (type === "linear") {
      const direction = /^(to\s+(?:(?:left|right|top|bottom)(?:\s+|$)){1,2})/.exec(prelude)?.[0]?.trim();
      if (direction) {
        const directions: Record<string, number> = { top: 0, "top right": 45, "right top": 45, right: 90, "bottom right": 135, "right bottom": 135, bottom: 180, "bottom left": 225, "left bottom": 225, left: 270, "top left": 315, "left top": 315 };
        // Corner directions depend on the element's aspect ratio. Keep them as CSS.
        if (direction.slice(3).includes(" ")) return null;
        angle = directions[direction.slice(3)] ?? 180;
        prelude = prelude.slice(direction.length).trim();
      } else if (!prelude.startsWith("in ")) {
        const rawAngle = splitTopLevelWhitespace(prelude)[0]!;
        const parsed = angleDegrees(rawAngle);
        if (parsed === null) return null;
        angle = parsed;
        prelude = prelude.slice(rawAngle.length).trim();
      }
    } else if (type === "conic" && prelude.startsWith("from ")) {
      const rawAngle = splitTopLevelWhitespace(prelude)[1]!;
      const parsed = angleDegrees(rawAngle);
      if (parsed === null) return null;
      angle = parsed;
      prelude = prelude.slice(5 + rawAngle.length).trim();
    }
  }
  const stops: Array<{ color: string; position: number | null }> = [];
  for (const part of parts) {
    const words = splitTopLevelWhitespace(part);
    const positions: number[] = [];
    while (words.length > 1) {
      const last = words[words.length - 1]!;
      const percent = /^([+-]?(?:\d*\.)?\d+)%$/.exec(last);
      const degrees = type === "conic" ? angleDegrees(last) : null;
      if (!percent && degrees === null && last !== "0") break;
      positions.unshift(percent ? Number(percent[1]) : degrees !== null ? degrees / 3.6 : 0);
      words.pop();
    }
    const color = words.join(" ");
    // Length stops and color hints cannot be represented by a percentage slider.
    if (!color || words.length !== 1 || /^([+-]?\d|calc\(|var\()/i.test(color) || positions.length > 2) return null;
    if (positions.length) positions.forEach((position) => stops.push({ color, position }));
    else stops.push({ color, position: null });
  }
  if (stops.length < 2) return null;
  stops[0]!.position ??= 0;
  stops[stops.length - 1]!.position ??= 100;
  let previous = stops[0]!.position!;
  for (const stop of stops) {
    if (stop.position !== null) {
      stop.position = Math.max(previous, stop.position);
      previous = stop.position;
    }
  }
  let start = 0;
  while (start < stops.length - 1) {
    let end = start + 1;
    while (stops[end]!.position === null) end++;
    for (let index = start + 1; index < end; index++) {
      stops[index]!.position = stops[start]!.position! + (stops[end]!.position! - stops[start]!.position!) * (index - start) / (end - start);
    }
    start = end;
  }
  return { type, repeating: Boolean(match[1]), angle, prelude, stops: stops as GradientStop[] };
}

export function serializeGradient(gradient: GradientValue): string {
  const prefix = gradient.type === "linear" ? `${gradient.angle}deg`
    : gradient.type === "conic" ? `from ${gradient.angle}deg` : "";
  const prelude = [prefix, gradient.prelude].filter(Boolean).join(" ");
  const stops = [...gradient.stops].sort((a, b) => a.position - b.position)
    .map((stop) => `${stop.color} ${Number(stop.position.toFixed(3))}%`).join(", ");
  return `${gradient.repeating ? "repeating-" : ""}${gradient.type}-gradient(${prelude ? `${prelude}, ` : ""}${stops})`;
}
