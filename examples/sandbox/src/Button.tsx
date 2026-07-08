import { type MouseEvent } from "react";

export function Button({
  label,
  variant = "secondary",
  onClick,
}: {
  label: string;
  variant?: "primary" | "secondary";
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button className="btn" onClick={onClick}>
      {label}
    </button>
  );
}