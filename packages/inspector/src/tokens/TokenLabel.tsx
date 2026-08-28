import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, HTMLAttributes, ReactElement, ReactNode } from "react";

type TokenLabelElement = "code" | "span";

export interface TokenLabelProps extends HTMLAttributes<HTMLElement> {
  as?: TokenLabelElement;
}

interface TokenLabelMeasurement {
  overflow: number;
  truncated: boolean;
}

interface TokenLabelStyle extends CSSProperties {
  "--token-label-overflow"?: string;
}

function textContent(children: ReactNode): string {
  if (children === null || children === undefined || typeof children === "boolean") return "";
  if (typeof children === "string" || typeof children === "number" || typeof children === "bigint") {
    return String(children);
  }
  if (Array.isArray(children)) return children.map(textContent).join("");
  return "";
}

/** Returns the number of pixels hidden by a token label's available width. */
export function tokenLabelOverflow(label: HTMLElement): number {
  const content = label.firstElementChild as HTMLElement | null;
  const contentWidth = content?.scrollWidth ?? label.scrollWidth;
  return Math.max(0, contentWidth - label.clientWidth);
}

function useTokenLabelMeasurement<T extends HTMLElement>(contentKey: string): {
  labelRef: React.RefObject<T>;
  measurement: TokenLabelMeasurement;
} {
  const labelRef = useRef<T>(null);
  const [measurement, setMeasurement] = useState<TokenLabelMeasurement>({ overflow: 0, truncated: false });

  useLayoutEffect(() => {
    const label = labelRef.current;
    if (!label) return;

    const updateMeasurement = (): void => {
      const overflow = tokenLabelOverflow(label);
      setMeasurement((previous) => previous.overflow === overflow
        ? previous
        : { overflow, truncated: overflow > 0 });
    };

    updateMeasurement();

    const ownerWindow = label.ownerDocument.defaultView;
    const ResizeObserverConstructor = ownerWindow?.ResizeObserver;
    const resizeObserver = ResizeObserverConstructor
      ? new ResizeObserverConstructor(updateMeasurement)
      : null;
    resizeObserver?.observe(label);
    if (label.firstElementChild) resizeObserver?.observe(label.firstElementChild);
    ownerWindow?.addEventListener("resize", updateMeasurement);

    return () => {
      resizeObserver?.disconnect();
      ownerWindow?.removeEventListener("resize", updateMeasurement);
    };
  }, [contentKey]);

  return { labelRef, measurement };
}

export function TokenLabel({ as = "span", className, children, title, style, ...props }: TokenLabelProps): ReactElement {
  const childText = textContent(children);
  const { labelRef, measurement } = useTokenLabelMeasurement(childText);
  const labelStyle: TokenLabelStyle | undefined = measurement.overflow > 0
    ? { ...style, "--token-label-overflow": `${measurement.overflow}px` }
    : style;
  const labelProps = {
    ...props,
    ref: labelRef,
    className: `token-label${className ? ` ${className}` : ""}`,
    title: title ?? childText,
    style: labelStyle,
    "data-truncated": measurement.truncated ? "true" : "false",
  };
  const content = <span className="token-label__content">{children}</span>;

  return as === "code"
    ? <code {...labelProps}>{content}</code>
    : <span {...labelProps}>{content}</span>;
}
