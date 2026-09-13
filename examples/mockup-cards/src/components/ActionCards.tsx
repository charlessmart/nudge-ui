import type { CSSProperties, ReactNode } from "react";
import { IconArrowRight } from "@tabler/icons-react";

export interface PhotoCardProps {
  title: string;
  description: string;
  /** Unsplash CDN URL for the card background. */
  image: string;
  /** Category accent for the corner chip. */
  chipTone: "blue" | "emerald" | "amber" | "violet";
  /** Stroked icon shown inside the white chip. */
  chipIcon: ReactNode;
}

const SCRIM =
  "linear-gradient(to top, rgb(0 0 0 / 92%) 0%, rgb(0 0 0 / 62%) 42%, rgb(0 0 0 / 18%) 100%)";

/** Photographic card: the destination itself is the artwork. */
export function PhotoCard({
  title,
  description,
  image,
  chipTone,
  chipIcon,
}: PhotoCardProps): ReactNode {
  // Only the custom property is set inline. The background-image declaration
  // itself stays in CSS, so the inspector's managed rules can still override it
  // (an inline property would win over the managed stylesheet).
  // SAFETY: Custom property keys are absent from React's CSSProperties, so object literals carrying them require a cast.
  const photoStyle = {
    "--card-photo": `${SCRIM}, url("${image}")`,
  } as CSSProperties;

  return (
    <a className="card card--photo" href="#" style={photoStyle}>
      <span className={`photo-chip photo-chip--${chipTone}`}>{chipIcon}</span>
      <span className="photo-footer">
        <span className="card-copy">
          <span className="t-label">{title}</span>
          <span className="card-desc">{description}</span>
        </span>
        <span className="photo-arrow">
          <IconArrowRight className="icon icon--16" />
        </span>
      </span>
    </a>
  );
}

export interface PrimaryActionCardProps {
  title: string;
  description: string;
  /** Replaces the default button slot entirely. */
  action: ReactNode;
  leading: ReactNode;
}

/** The single full-colour recommendation in the emphasis split. */
export function PrimaryActionCard({
  title,
  description,
  action,
  leading,
}: PrimaryActionCardProps): ReactNode {
  return (
    <div className="card card--primary">
      {leading}
      <span className="card-copy">
        <span className="t-label">{title}</span>
        <span className="card-desc">{description}</span>
      </span>
      {action}
    </div>
  );
}

export interface SecondaryCardProps {
  label: string;
  leading: ReactNode;
}

/** Quiet companion cards under a primary action. */
export function SecondaryCard({ label, leading }: SecondaryCardProps): ReactNode {
  return (
    <a className="card card--secondary" href="#">
      {leading}
      <span className="card-copy">
        <span className="t-label">{label}</span>
      </span>
    </a>
  );
}
