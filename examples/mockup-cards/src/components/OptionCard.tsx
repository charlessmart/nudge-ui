import type { ReactNode } from "react";
import { IconChevronRight } from "@tabler/icons-react";

export interface OptionCardProps {
  /** Short action label, e.g. "Connect a bank". */
  title: string;
  /** One line of supporting detail. */
  description: string;
  /** Leading marks: a BankAvatar stack, or a single IconAvatar. */
  leading: ReactNode;
}

/**
 * The primary sub-card used across these mockups.
 *
 * One definition, many call sites: change it here and every card in the grid
 * follows.
 */
export function OptionCard({
  title,
  description,
  leading,
}: OptionCardProps): ReactNode {
  return (
    <a className="card card--grid" href="#">
      {leading}
      <span className="card-footer">
        <span className="card-copy">
          <span className="t-label">{title}</span>
          <span className="card-desc">{description}</span>
        </span>
        <span className="chevron">
          <IconChevronRight className="icon icon--16" />
        </span>
      </span>
    </a>
  );
}

export interface ListRowProps {
  title: string;
  description: string;
  leading: ReactNode;
}

/** Denser row used by the divided-list variation. */
export function ListRow({ title, description, leading }: ListRowProps): ReactNode {
  return (
    <a className="list-row" href="#">
      {leading}
      <span className="card-copy">
        <span className="t-label">{title}</span>
        <span className="card-desc">{description}</span>
      </span>
      <span className="chevron">
        <IconChevronRight className="icon icon--16" />
      </span>
    </a>
  );
}

export interface InstitutionCardProps {
  /** Institution name, shown under the mark. */
  name: string;
  /** Account types available at this institution. */
  detail: string;
  /** The coloured mark circle. */
  mark: ReactNode;
}

/** Logo-led card used by the institution grid. */
export function InstitutionCard({
  name,
  detail,
  mark,
}: InstitutionCardProps): ReactNode {
  return (
    <a className="card card--institution" href="#">
      <span className="institution-head">
        {mark}
        <span className="chevron">
          <IconChevronRight className="icon icon--16" />
        </span>
      </span>
      <span className="card-copy">
        <span className="t-label">{name}</span>
        <span className="card-desc">{detail}</span>
      </span>
    </a>
  );
}
