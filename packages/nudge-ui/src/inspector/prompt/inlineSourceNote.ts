import type { ElementChangeRecord } from "../changes/types.ts";

/** Says where an inline value lives in source, so the agent edits the `style` prop rather than adding CSS (ADR-0053). */
export function inlineSourceNote(rec: ElementChangeRecord): string | null {
  const inline = rec.inlineSource;
  if (!inline) return null;
  if (inline.kind === "opaque" || !inline.property) {
    return `The current value comes from the element's style prop, through \`${inline.source}\`. `
      + "Trace where it is set before changing it.";
  }
  const declaration = `\`${inline.property}: ${inline.source}\``;
  if (inline.kind === "literal") {
    return `The current value is written on the element's style prop as ${declaration}; change it there.`;
  }
  return `The current value comes from the element's style prop, ${declaration}. Decide whether to change what `
    + `\`${inline.source}\` holds, use a different value, or override it on this element only, and say which you chose `
    + "if you change a shared value.";
}
