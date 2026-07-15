import type { ButtonHTMLAttributes, ReactElement } from "react";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  "data-test"?: string;
};

export function IconButton({ label, className, ...props }: IconButtonProps): ReactElement {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      aria-label={label}
      className={`dt-icon-button${className ? ` ${className}` : ""}`}
    />
  );
}
