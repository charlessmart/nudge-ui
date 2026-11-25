import type { StyleDeclaration } from "../tokens/editActions.ts";
import { keepsOneLine, type StyleReader } from "./textWrap.ts";

/** How text is cut short: `none`, or the number of lines it keeps (one line ends in an ellipsis, more are a line clamp). */
export type TextTruncation = "none" | `${number}`;

/** The choices offered; a page's own clamp of another length is listed beside them. */
export const TEXT_TRUNCATIONS: readonly TextTruncation[] = ["none", "1", "2", "3"];

export function truncationLabel(truncation: TextTruncation): string {
  if (truncation === "none") return "None";
  return truncation === "1" ? "1 line" : `${truncation} lines`;
}

/** A line clamp wins over the single-line form, as it does in the browser once `display` is `-webkit-box`. */
export function readTextTruncation(read: StyleReader): TextTruncation {
  const clamp = Number.parseInt(read("-webkit-line-clamp"), 10);
  if (read("display") === "-webkit-box" && Number.isFinite(clamp) && clamp > 0) {
    return `${clamp}`;
  }
  const clipped = read("overflow") !== "visible" || read("overflow-x") === "hidden";
  if (read("text-overflow") === "ellipsis" && keepsOneLine(read) && clipped) return "1";
  return "none";
}

/**
 * The declarations that move text from one truncation to another. One line keeps the element's own display and cuts with
 * `text-overflow`; more lines need the `-webkit-box` line clamp. Leaving a form undoes only what that form set, so a
 * clamp gives way to `display: block`, the display the clamp most often replaced.
 */
export function truncationDeclarations(current: TextTruncation, next: TextTruncation): StyleDeclaration[] {
  if (current === next) return [];
  const declarations: StyleDeclaration[] = [];
  const wasClamped = current !== "none" && current !== "1";
  if (next === "none") {
    if (current === "1") {
      declarations.push({ property: "text-overflow", value: "clip" }, { property: "white-space", value: "normal" });
    } else {
      declarations.push({ property: "-webkit-line-clamp", value: "none" }, { property: "display", value: "block" });
    }
    declarations.push({ property: "overflow", value: "visible" });
    return declarations;
  }
  if (next === "1") {
    if (wasClamped) declarations.push({ property: "-webkit-line-clamp", value: "none" }, { property: "display", value: "block" });
    declarations.push(
      { property: "overflow", value: "hidden" },
      { property: "text-overflow", value: "ellipsis" },
      { property: "white-space", value: "nowrap" },
    );
    return declarations;
  }
  if (current === "1") declarations.push({ property: "white-space", value: "normal" });
  declarations.push(
    { property: "display", value: "-webkit-box" },
    { property: "-webkit-box-orient", value: "vertical" },
    { property: "-webkit-line-clamp", value: next },
    { property: "overflow", value: "hidden" },
  );
  return declarations;
}
