import type { ReactNode } from "react";

/**
 * Circle colours. A brand-neutral ramp, so every white mark clears contrast.
 *
 * The union is written inline on the prop rather than behind a named alias:
 * the inspector's contract extractor reads literal unions declared in the
 * interface but does not follow a named alias to its definition.
 */
export interface AvatarProps {
  /** Which circle colour this mark uses. */
  tone: "blue" | "red" | "cyan" | "violet" | "teal" | "green" | "emerald" | "amber";
  /**
   * Accessible name for the mark.
   *
   * Required, and must be unique across every rendered Avatar. The inspector
   * identifies a single rendered instance by source site plus distinguishing
   * evidence, and `aria-label` is the only evidence a plain span can carry —
   * `data-cprops` records static authored props, and these marks contain no
   * text. Without a unique name, "unlink this one mark from its component"
   * resolves as ambiguous and the edit is silently dropped.
   */
  label: string;
  /** The mark itself: a BankMark, or a stroked Tabler icon. */
  children: ReactNode;
}

export type AvatarTone = AvatarProps["tone"];

/** One coloured circle holding a mark. */
export function Avatar({ tone, label, children }: AvatarProps): ReactNode {
  return (
    <span className={`avatar avatar--${tone}`} role="img" aria-label={label}>
      {children}
    </span>
  );
}

/**
 * Overlapping cluster. Earlier marks sit in front, each ringed in white.
 *
 * Not aria-hidden: each member carries its own name, so the cluster is
 * announced as the list of marks it shows.
 */
export function AvatarStack({ children }: { children: ReactNode }): ReactNode {
  return <span className="avatar-stack">{children}</span>;
}

export interface IconTileProps {
  /** Optional tint. Omit for the neutral well. */
  tone?: "violet";
  children: ReactNode;
}

/** Tinted rounded square holding a stroked icon. */
export function IconTile({ tone, children }: IconTileProps): ReactNode {
  return (
    <span className={`icon-tile${tone ? ` icon-tile--${tone}` : ""}`}>{children}</span>
  );
}
