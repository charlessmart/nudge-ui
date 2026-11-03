import { dialectsInUse, stylingSystemLabel, type DialectName } from "../../css/dialects/index.ts";
import type { TokenEntry } from "../../css/model/index.ts";

export interface DetectedFramework {
  framework: string;
  stylingSystem: string;
  stylingDialects: DialectName[];
}

export function detectFramework(tokens: readonly TokenEntry[]): DetectedFramework {
  const stylingDialects = dialectsInUse(tokens);
  return { framework: "React", stylingSystem: stylingSystemLabel(stylingDialects), stylingDialects };
}
