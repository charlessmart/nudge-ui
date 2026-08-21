import type { TokenEntry } from "virtual:design-tokens";

export interface DetectedFramework {
  framework: string;
  stylingSystem: string;
}

export function detectFramework(tokens: readonly TokenEntry[]): DetectedFramework {
  let stylingSystem = "CSS custom properties";
  for (const token of tokens) {
    const adapter = token.adapter;
    if (!adapter) continue;
    if (adapter === "vanilla-extract") {
      stylingSystem = "vanilla-extract (sprinkles)";
      break;
    }
    if (adapter === "tailwind-v3") {
      stylingSystem = "Tailwind v3";
      break;
    }
    if (adapter === "tailwind-v4") {
      stylingSystem = "Tailwind v4";
      break;
    }
  }
  return { framework: "React", stylingSystem };
}
