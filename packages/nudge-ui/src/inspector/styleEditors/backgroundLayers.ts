import { splitTopLevel } from "../../css/value-semantics/cssSyntax.ts";
import type { GradientValue } from "./gradientValue.ts";
import { isEmptyColorValue } from "./ColorPicker.tsx";

export type BackgroundMode = "solid" | "gradient" | "image";
export interface BackgroundLayer {
  mode: BackgroundMode;
  baseColor: boolean;
  gradient?: GradientValue;
  value: string;
  blend: string;
  size: string;
  repeat: string;
  position: string;
}

export const BACKGROUND_BLEND_MODES = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"]
  .map((value) => ({ value, label: value.replace(/-/g, " ").replace(/^./, (letter) => letter.toUpperCase()) }));

export function backgroundMode(value: string): BackgroundMode {
  if (!value || value === "none") return "solid";
  return /(?:repeating-)?(?:linear|radial|conic)-gradient\(/.test(value) ? "gradient" : "image";
}

export function newBackgroundLayer(): BackgroundLayer {
  return { mode: "solid", baseColor: true, value: "#ffffff", blend: "normal", size: "auto", repeat: "repeat", position: "0% 0%" };
}

/** CSS repeats shorter background property lists to match the image count. */
export function readBackgroundLayers(read: (property: string, fallback: string) => string): BackgroundLayer[] {
  const image = read("background-image", "none");
  const images = image === "none" ? [] : splitTopLevel(image, ",").map((value) => value.trim());
  const listValue = (property: string, fallback: string, index: number): string => {
    const values = splitTopLevel(read(property, fallback), ",");
    return values[index % values.length]?.trim() || fallback;
  };
  const layers = images.map((value, index) => {
    const flat = /^linear-gradient\((.*)\)$/s.exec(value);
    const colors = flat ? splitTopLevel(flat[1]!, ",").map((color) => color.trim()) : [];
    const solid = colors.length === 2 && colors[0] === colors[1];
    return {
      mode: solid ? "solid" as const : backgroundMode(value),
      baseColor: false,
      value: solid ? colors[0]! : value,
      blend: listValue("background-blend-mode", "normal", index),
      size: listValue("background-size", "auto", index),
      repeat: listValue("background-repeat", "repeat", index),
      position: listValue("background-position", "0% 0%", index),
    };
  });
  const color = read("background-color", "transparent");
  if (!isEmptyColorValue(color)) layers.push({ ...newBackgroundLayer(), value: color });
  return layers;
}

export function backgroundDeclarations(layers: BackgroundLayer[]): { property: string; value: string }[] {
  const base = layers.at(-1)?.mode === "solid" && layers.at(-1)?.baseColor ? layers.at(-1) : undefined;
  const images = base ? layers.slice(0, -1) : layers;
  return [
    { property: "background-color", value: base?.value ?? "transparent" },
    { property: "background-image", value: images.map((layer) => layer.mode === "solid" ? `linear-gradient(${layer.value}, ${layer.value})` : layer.value).join(", ") || "none" },
    ...(["blend", "size", "repeat", "position"] as const).map((field) => ({
      property: field === "blend" ? "background-blend-mode" : `background-${field}`,
      value: images.map((layer) => layer[field]).join(", ") || newBackgroundLayer()[field],
    })),
  ];
}
