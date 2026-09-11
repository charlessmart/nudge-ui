import type { TokenEntry } from "virtual:design-tokens";
import { detectStylingSystem } from "../runtime/runtimeConfig.ts";

export interface DetectedFramework {
  framework: string;
  stylingSystem: string;
}

export function detectFramework(tokens: readonly TokenEntry[]): DetectedFramework {
  return { framework: "React", stylingSystem: detectStylingSystem(tokens) };
}
