import type { ReactElement } from "react";

/**
 * The Nudge UI mark, drawn with `currentColor` so it follows the inspector
 * theme. Same artwork as the extension and landing favicons.
 */
export function NudgeLogoIcon({ size = "var(--icon-size-small)" }: { size?: string }): ReactElement {
  return (
    <svg viewBox="5 4 35 35" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M14.7742 6C27.6015 6 38 16.569 38 29.6066V38H30.7742V29.6066C30.7742 20.6251 23.6107 13.3443 14.7742 13.3443H13.2258V38H6V6H14.7742Z" />
      <path d="M39 15.6629C37 11.5 33 7 28.4919 5H39V15.6629Z" />
    </svg>
  );
}
