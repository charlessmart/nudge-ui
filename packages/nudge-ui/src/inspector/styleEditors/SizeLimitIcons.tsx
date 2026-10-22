import type { ReactElement } from "react";

interface SizeLimitIconProps {
  /** The path data of each stroke in the icon's 24 x 24 box. */
  paths: readonly string[];
}

/** Drawn on the icon grid with the shared stroke width; the colour follows the field's leading style. */
function SizeLimitIcon({ paths }: SizeLimitIconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="var(--icon-size-small)"
      height="var(--icon-size-small)"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="var(--icon-stroke-width)"
      aria-hidden="true"
    >
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

const MIN_HEIGHT_PATHS = [
  "M20 12.5L4 12.5",
  "M12 2V9M10 7L12 9L14 7",
  "M12 22.5V15.5M10 17.5L12 15.5L14 17.5",
] as const;

const MAX_HEIGHT_PATHS = [
  "M20 20.5L4 20.5",
  "M20 3.5L4 3.5",
  "M12 17.5V6.5M10 15.5L12 17.5L14 15.5M10 8.5L12 6.5L14 8.5",
] as const;

const MIN_WIDTH_PATHS = [
  "M11.75 20.25L11.75 4.25",
  "M22.25 12.25L15.25 12.25M17.25 10.25L15.25 12.25L17.25 14.25",
  "M1.75 12.25L8.75 12.25M6.75 10.25L8.75 12.25L6.75 14.25",
] as const;

const MAX_WIDTH_PATHS = [
  "M3.5 20L3.5 4",
  "M20.5 20L20.5 4",
  "M6.5 12L17.5 12M8.5 10L6.5 12L8.5 14M15.5 10L17.5 12L15.5 14",
] as const;

export function IconMinHeight(): ReactElement {
  return <SizeLimitIcon paths={MIN_HEIGHT_PATHS} />;
}

export function IconMaxHeight(): ReactElement {
  return <SizeLimitIcon paths={MAX_HEIGHT_PATHS} />;
}

export function IconMinWidth(): ReactElement {
  return <SizeLimitIcon paths={MIN_WIDTH_PATHS} />;
}

export function IconMaxWidth(): ReactElement {
  return <SizeLimitIcon paths={MAX_WIDTH_PATHS} />;
}
