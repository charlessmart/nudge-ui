import type { ReactElement } from "react";

/**
 * Before/after comparison glyph for the hold-to-view-original button.
 * Custom artwork rendered with the shared inspector icon tokens so it
 * matches the neighboring header icons.
 */
export function PeekOriginalIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="var(--icon-size-small)" height="var(--icon-size-small)" aria-hidden="true">
      <path
        d="M8.66667 5L6 5C4.34315 5 3 6.34315 3 8L3 16C3 17.6569 4.34315 19 6 19L12 19"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="var(--icon-stroke-width)"
      />
      <path
        d="M13 5L18 5C19.6569 5 21 6.34315 21 8L21 16C21 17.6569 19.6569 19 18 19L16.3333 19"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="var(--icon-stroke-width)"
      />
      <line
        x1="13.7721"
        y1="22.2984"
        x2="8.29835"
        y2="2.22788"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="var(--icon-stroke-width)"
      />
    </svg>
  );
}
