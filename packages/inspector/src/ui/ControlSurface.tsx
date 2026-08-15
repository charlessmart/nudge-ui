import type { HTMLAttributes, ReactElement, ReactNode } from "react";

/**
 * Visual boundary for an inspector control. It owns the shared control chrome
 * while the child owns its particular input or selection behaviour.
 */
export type ControlAppearance = "default" | "embedded";
export type ControlDensity = "default" | "compact";

export interface ControlSurfaceProps extends HTMLAttributes<HTMLSpanElement> {
  appearance?: ControlAppearance;
  density?: ControlDensity;
  "data-test"?: string;
  children?: ReactNode;
}

export function ControlSurface({
  appearance = "default",
  density = "default",
  className,
  children,
  ...props
}: ControlSurfaceProps): ReactElement {
  const classes = [
    "dt-control-surface",
    appearance === "embedded" ? "dt-control-surface--embedded" : "",
    density === "compact" ? "dt-control-surface--compact" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  return <span {...props} className={classes}>{children}</span>;
}
