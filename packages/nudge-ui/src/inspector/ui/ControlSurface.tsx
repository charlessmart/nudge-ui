import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";

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

export const ControlSurface = forwardRef<HTMLSpanElement, ControlSurfaceProps>(function ControlSurface(
  {
    appearance = "default",
    density = "default",
    className,
    children,
    ...props
  },
  ref,
) {
  const classes = [
    "control-surface",
    appearance === "embedded" ? "control-surface--embedded" : "",
    density === "compact" ? "control-surface--compact" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  return <span ref={ref} {...props} className={classes}>{children}</span>;
});
