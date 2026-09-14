import type { HTMLAttributes, ReactElement, ReactNode } from "react";

type TokenLabelElement = "code" | "span";

export interface TokenLabelProps extends HTMLAttributes<HTMLElement> {
  as?: TokenLabelElement;
}

function textContent(children: ReactNode): string {
  if (children === null || children === undefined || typeof children === "boolean") return "";
  if (typeof children === "string" || typeof children === "number" || typeof children === "bigint") {
    return String(children);
  }
  if (Array.isArray(children)) return children.map(textContent).join("");
  return "";
}

export function TokenLabel({ as = "span", className, children, title, ...props }: TokenLabelProps): ReactElement {
  const childText = textContent(children);
  const labelProps = {
    ...props,
    className: `token-label${className ? ` ${className}` : ""}`,
    title: title ?? childText,
  };
  const content = <span className="token-label__content">{children}</span>;

  return as === "code"
    ? <code {...labelProps}>{content}</code>
    : <span {...labelProps}>{content}</span>;
}
