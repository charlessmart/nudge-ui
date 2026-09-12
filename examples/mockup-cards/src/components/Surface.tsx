import type { ReactNode } from "react";
import { IconX } from "@tabler/icons-react";

export interface SurfaceProps {
  /** Modal heading. */
  title: string;
  /** One-line supporting copy under the heading. */
  subtitle: string;
  /** Renders the wider variant used by the institution grid. */
  wide?: boolean;
  children: ReactNode;
}

/** The modal shell every variation sits inside. */
export function Surface({
  title,
  subtitle,
  wide = false,
  children,
}: SurfaceProps): ReactNode {
  return (
    <div className={wide ? "surface surface--wide" : "surface"}>
      <div className="surface-head">
        <div className="surface-head-copy">
          <h3 className="t-title">{title}</h3>
          <p className="t-body t-muted">{subtitle}</p>
        </div>
        <span className="icon-button">
          <IconX className="icon" />
        </span>
      </div>
      {children}
    </div>
  );
}

/** Centred canvas that holds one surface. */
export function Stage({ children }: { children: ReactNode }): ReactNode {
  return <div className="stage">{children}</div>;
}

/** One named variation, centred in the viewport. */
export function Variation({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="variation" id={id}>
      <Stage>{children}</Stage>
    </section>
  );
}
