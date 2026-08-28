import type { ReactNode, ReactElement } from "react";

export interface BreadcrumbItem {
  id: string;
  label: ReactNode;
  active?: boolean;
  onSelect?: () => void;
  "data-test"?: string;
  "data-index"?: number;
  "data-cid"?: string;
  title?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  label?: string;
  className?: string;
  "data-test"?: string;
}

export function Breadcrumb({ items, label = "Selection hierarchy", className, "data-test": dataTest }: BreadcrumbProps): ReactElement {
  return (
    <nav className={`breadcrumb${className ? ` ${className}` : ""}`} aria-label={label} data-test={dataTest}>
      {items.map((item, index) => (
        <span className="breadcrumb__item" key={item.id}>
          {index > 0 ? <span className="breadcrumb__separator" aria-hidden="true">›</span> : null}
          <button
            type="button"
            className="breadcrumb__step"
            data-active={item.active ? "true" : "false"}
            data-test={item["data-test"]}
            data-index={item["data-index"]}
            data-cid={item["data-cid"]}
            title={item.title}
            aria-current={item.active ? "location" : undefined}
            onClick={item.onSelect}
          >
            {item.label}
          </button>
        </span>
      ))}
    </nav>
  );
}
