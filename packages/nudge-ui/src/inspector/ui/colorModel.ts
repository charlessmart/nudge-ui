// Channel conversions and surface geometry adapted from Toolcraft's color picker
// (https://github.com/pixel-point/toolcraft, MIT, Copyright (c) 2026 Pixel Point).

export type ColorFormat = "hex" | "rgb" | "hsl" | "hsb";
/** HSL edits on a saturation/lightness plane; every other format uses saturation/brightness. */
export type ColorSurfaceModel = "hsl" | "hsb";

/** Hue in degrees, saturation, value and alpha in 0–1. */
export interface Hsva {
  h: number;
  s: number;
  v: number;
  a: number;
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export const COLOR_FORMATS: ReadonlyArray<{ value: ColorFormat; label: string }> = [
  { value: "hex", label: "Hex" },
  { value: "rgb", label: "RGB" },
  { value: "hsl", label: "HSL" },
  { value: "hsb", label: "HSB" },
];

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function surfaceModelFor(format: ColorFormat): ColorSurfaceModel {
  return format === "hsl" ? "hsl" : "hsb";
}

export function hsvToRgb({ h, s, v }: Pick<Hsva, "h" | "s" | "v">): [number, number, number] {
  const hue = ((h % 360) + 360) % 360 / 60;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const m = v - chroma;
  const [r, g, b] = hue < 1 ? [chroma, x, 0]
    : hue < 2 ? [x, chroma, 0]
      : hue < 3 ? [0, chroma, x]
        : hue < 4 ? [0, x, chroma]
          : hue < 5 ? [x, 0, chroma]
            : [chroma, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function rgbToHsv(r: number, g: number, b: number): Pick<Hsva, "h" | "s" | "v"> {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);
  let h = 0;
  if (delta !== 0) {
    if (max === red) h = ((green - blue) / delta) % 6;
    else if (max === green) h = (blue - red) / delta + 2;
    else h = (red - green) / delta + 4;
  }
  return { h: ((h * 60) + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

/** Saturation and lightness in 0–1. */
export function hsvToHsl({ s, v }: Pick<Hsva, "s" | "v">): { s: number; l: number } {
  const l = v * (1 - s / 2);
  return { s: l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l), l };
}

export function hslToHsv(s: number, l: number): { s: number; v: number } {
  const v = l + s * Math.min(l, 1 - l);
  return { s: v === 0 ? 0 : 2 * (1 - l / v), v };
}

/** Grey and black carry no hue (and black no saturation), so the previous ones survive a round trip through RGB. */
export function hsvaFromRgba({ r, g, b, a }: Rgba, previous?: Hsva): Hsva {
  const next = rgbToHsv(r, g, b);
  if (!previous) return { ...next, a };
  if (next.v === 0) return { h: previous.h, s: previous.s, v: 0, a };
  if (next.s === 0) return { h: previous.h, s: 0, v: next.v, a };
  return { ...next, a };
}

export function rgbaFromHsva(color: Hsva): Rgba {
  const [r, g, b] = hsvToRgb(color);
  return { r, g, b, a: color.a };
}

function hexByte(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
}

export function hexFromHsva(color: Hsva, withAlpha = color.a < 1): string {
  const [r, g, b] = hsvToRgb(color);
  return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}${withAlpha ? hexByte(color.a * 255) : ""}`;
}

function roundAlpha(alpha: number): number {
  return Math.round(alpha * 100);
}

/** HSB has no CSS syntax, so it writes hex like the Hex format. */
export function formatCssColor(color: Hsva, format: ColorFormat): string {
  const alpha = roundAlpha(color.a) < 100 ? ` / ${roundAlpha(color.a)}%` : "";
  if (format === "rgb") {
    const [r, g, b] = hsvToRgb(color);
    return `rgb(${r} ${g} ${b}${alpha})`;
  }
  if (format === "hsl") {
    const [h, s, l] = channelValues(color, "hsl");
    return `hsl(${h} ${s}% ${l}%${alpha})`;
  }
  return hexFromHsva(color, roundAlpha(color.a) < 100);
}

/** The three color channels a format displays, rounded as typed. Hex shows RGB. */
export function channelValues(color: Hsva, format: ColorFormat): [number, number, number] {
  if (format === "hsl") {
    const { s, l } = hsvToHsl(color);
    return [Math.round(color.h), Math.round(s * 100), Math.round(l * 100)];
  }
  if (format === "hsb") return [Math.round(color.h), Math.round(color.s * 100), Math.round(color.v * 100)];
  return hsvToRgb(color);
}

export function channelMax(format: ColorFormat, index: number): number {
  if (format === "rgb" || format === "hex") return 255;
  return index === 0 ? 360 : 100;
}

export function channelLabels(format: ColorFormat): [string, string, string] {
  if (format === "hsl") return ["Hue", "Saturation", "Lightness"];
  if (format === "hsb") return ["Hue", "Saturation", "Brightness"];
  return ["Red", "Green", "Blue"];
}

/** Applies one typed channel, keeping hue when the result is grey. */
export function withChannel(color: Hsva, format: ColorFormat, index: number, value: number): Hsva {
  const channels = channelValues(color, format);
  channels[index] = clamp(value, 0, channelMax(format, index));
  const [first, second, third] = channels;
  if (format === "hsl") {
    const { s, v } = hslToHsv(second / 100, third / 100);
    return { h: first % 360, s, v, a: color.a };
  }
  if (format === "hsb") return { h: first % 360, s: second / 100, v: third / 100, a: color.a };
  return hsvaFromRgba({ r: first, g: second, b: third, a: color.a }, color);
}

export function parseHex(value: string): Rgba | null {
  const match = value.trim().match(/^#?([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
  if (!match) return null;
  let raw = match[1]!;
  if (raw.length <= 4) raw = raw.split("").map((part) => part + part).join("");
  const byte = (index: number): number => Number.parseInt(raw.slice(index, index + 2), 16);
  return { r: byte(0), g: byte(2), b: byte(4), a: raw.length === 8 ? byte(6) / 255 : 1 };
}

function parseNumber(part: string, scale: number): number {
  return part.endsWith("%") ? Number.parseFloat(part) / 100 * scale : Number.parseFloat(part);
}

function parseAlpha(part: string | undefined): number {
  if (part === undefined) return 1;
  return clamp(part.endsWith("%") ? Number.parseFloat(part) / 100 : Number.parseFloat(part), 0, 1);
}

function functionParts(value: string, name: RegExp): string[] | null {
  const match = value.trim().match(new RegExp(`^(?:${name.source})\\((.*)\\)$`, "i"));
  if (!match) return null;
  const parts = match[1]!.split(/[\s,/]+/).filter(Boolean);
  return parts.length === 3 || parts.length === 4 ? parts : null;
}

/** Parses hex, rgb(), hsl() and color(srgb); null for anything the browser must resolve. */
export function parseColorSyntax(value: string): Rgba | null {
  const hex = value.trim().startsWith("#") ? parseHex(value) : null;
  if (hex) return hex;
  const rgb = functionParts(value, /rgba?/);
  if (rgb) {
    const [r, g, b] = rgb.slice(0, 3).map((part) => parseNumber(part, 255));
    const color = { r: Math.round(r!), g: Math.round(g!), b: Math.round(b!), a: parseAlpha(rgb[3]) };
    return [color.r, color.g, color.b, color.a].every(Number.isFinite) ? color : null;
  }
  const hsl = functionParts(value, /hsla?/);
  if (hsl) {
    const h = Number.parseFloat(hsl[0]!);
    const s = clamp(Number.parseFloat(hsl[1]!) / 100, 0, 1);
    const l = clamp(Number.parseFloat(hsl[2]!) / 100, 0, 1);
    if (![h, s, l].every(Number.isFinite)) return null;
    const [r, g, b] = hsvToRgb({ h, ...hslToHsv(s, l) });
    return { r, g, b, a: parseAlpha(hsl[3]) };
  }
  const srgb = value.trim().match(/^color\(\s*srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.e+-]+%?))?\s*\)$/i);
  if (srgb) {
    const [r, g, b] = [srgb[1], srgb[2], srgb[3]].map((part) => Math.round(clamp(Number(part) * 255, 0, 255)));
    return [r, g, b].every(Number.isFinite) ? { r: r!, g: g!, b: b!, a: parseAlpha(srgb[4]) } : null;
  }
  return null;
}

/** Resolves any CSS color (names, oklch, color-mix…) through the browser. */
export function parseCssColor(value: string): Rgba | null {
  const direct = parseColorSyntax(value);
  if (direct || typeof document === "undefined" || !value.trim() || /var\(/i.test(value)) return direct;
  const probe = document.createElement("span");
  probe.setAttribute("data-nudge-ui", "value-probe");
  probe.style.color = value.trim();
  if (!probe.style.color) return null;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  return parseColorSyntax(computed) ?? rasterizeColor(computed);
}

/** Wide-gamut computed colors (oklch, lab) keep their syntax; painting one pixel converts them to sRGB. */
function rasterizeColor(value: string): Rgba | null {
  const context = document.createElement("canvas").getContext?.("2d", { willReadFrequently: true });
  if (!context) return null;
  context.canvas.width = 1;
  context.canvas.height = 1;
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
  return { r: r!, g: g!, b: b!, a: a! / 255 };
}

export function formatForValue(value: string): ColorFormat {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("rgb")) return "rgb";
  if (trimmed.startsWith("hsl")) return "hsl";
  return "hex";
}

/** Thumb position on the surface, each axis in 0–1 from the top-left. */
export function surfacePosition(color: Hsva, model: ColorSurfaceModel): { x: number; y: number } {
  if (model === "hsl") {
    const { s, l } = hsvToHsl(color);
    return { x: s, y: 1 - l };
  }
  return { x: color.s, y: 1 - color.v };
}

export function colorAtSurface(color: Hsva, model: ColorSurfaceModel, x: number, y: number): Hsva {
  const px = clamp(x, 0, 1);
  const py = clamp(y, 0, 1);
  if (model === "hsl") return { ...color, ...hslToHsv(px, 1 - py) };
  return { ...color, s: px, v: 1 - py };
}

export function surfaceBackground(color: Hsva, model: ColorSurfaceModel): string {
  const hue = Math.round(color.h);
  if (model === "hsl") {
    return `linear-gradient(to bottom, #fff 0%, transparent 50%, #000 100%), linear-gradient(to right, hsl(${hue} 0% 50%), hsl(${hue} 100% 50%))`;
  }
  return `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))`;
}
