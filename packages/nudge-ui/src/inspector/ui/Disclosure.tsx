import { Collapsible } from "@base-ui/react/collapsible";
import { IconChevronDown } from "@tabler/icons-react";
import type { ReactElement, ReactNode } from "react";

export interface DisclosureProps {
  readonly title: ReactNode;
  /** Optional accessory rendered between the label and the chevron (e.g. a count badge). */
  readonly badge?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly triggerClassName?: string;
  readonly panelClassName?: string;
  readonly defaultOpen?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /** Keeps panel content in the DOM while collapsed, matching native details behavior. */
  readonly keepMounted?: boolean;
  readonly "data-test"?: string;
  readonly triggerDataTest?: string;
}

/**
 * A single collapsible disclosure built on Base UI Collapsible.
 * Replaces native details/summary for consistent 12px label styling and chevron.
 */
export function Disclosure({
  title,
  badge,
  children,
  className,
  triggerClassName,
  panelClassName,
  defaultOpen,
  open,
  onOpenChange,
  keepMounted = true,
  "data-test": dataTest,
  triggerDataTest,
}: DisclosureProps): ReactElement {
  function handleOpenChange(next: boolean): void {
    onOpenChange?.(next);
  }

  return (
    <Collapsible.Root
      className={`disclosure${className ? ` ${className}` : ""}`}
      data-test={dataTest}
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={handleOpenChange}
    >
      <Collapsible.Trigger
        className={`disclosure__trigger${triggerClassName ? ` ${triggerClassName}` : ""}`}
        data-test={triggerDataTest}
      >
        <span className="disclosure__label">{title}</span>
        {badge}
        <IconChevronDown className="disclosure__chevron" size={15} stroke={2} aria-hidden="true" />
      </Collapsible.Trigger>
      <Collapsible.Panel
        keepMounted={keepMounted}
        className={`disclosure__panel${panelClassName ? ` ${panelClassName}` : ""}`}
      >
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
