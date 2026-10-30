import { useState } from "react";
import type { ReactElement } from "react";

export interface RollingTextProps {
  readonly value: string;
  readonly className?: string;
}

interface Glyph {
  readonly char: string;
  /** What this slot showed before, while it rolls up to `char`. */
  readonly previous: string | null;
  /** Remounts the stack so every change restarts the roll. */
  readonly rolls: number;
}

/** One character slot: when its character changes, the old one drifts up and fades out as the new one rises in and fades up. */
function RollingGlyph({ char }: { readonly char: string }): ReactElement {
  const [glyph, setGlyph] = useState<Glyph>({ char, previous: null, rolls: 0 });
  // Adjusted while rendering, so the old character is already in the slot on the render that shows the new one.
  if (glyph.char !== char) setGlyph({ char, previous: glyph.char, rolls: glyph.rolls + 1 });
  return (
    <span className="rolling-text__glyph">
      {/* Keyed by the roll, so every change remounts both characters and restarts their animations. */}
      {glyph.previous === null ? null : <span key={`out-${glyph.rolls}`} className="rolling-text__out">{glyph.previous}</span>}
      <span key={`in-${glyph.rolls}`} className="rolling-text__in" data-rolling={glyph.previous === null ? undefined : ""}>{glyph.char}</span>
    </span>
  );
}

/**
 * Text whose characters drift up and fade when they change, the next one rising in behind. Slots line up from the end, so a digit keeps its
 * place when the text grows or shrinks, and a character that stays the same does not move.
 */
export function RollingText({ value, className }: RollingTextProps): ReactElement {
  const chars = [...value];
  return (
    <span className={className ? `rolling-text ${className}` : "rolling-text"}>
      {chars.map((char, index) => <RollingGlyph key={chars.length - index} char={char} />)}
    </span>
  );
}
