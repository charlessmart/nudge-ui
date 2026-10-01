import type { HTMLAttributes, ReactElement } from "react";
import { cx } from "../ui/classNames.ts";
import { Tooltip } from "../ui/Tooltip.tsx";

type TokenLabelElement = "code" | "span";

export interface TokenLabelProps extends HTMLAttributes<HTMLElement> {
  as?: TokenLabelElement;
}

export function TokenLabel({ as = "span", className, children, title, ...props }: TokenLabelProps): ReactElement {
  const labelProps = {
    ...props,
    className: cx("token-label", className),
  };
  const content = <span className="token-label__content">{children}</span>;
  const label = as === "code"
    ? <code {...labelProps}>{content}</code>
    : <span {...labelProps}>{content}</span>;

  return title === undefined ? label : <Tooltip content={title}>{label}</Tooltip>;
}
