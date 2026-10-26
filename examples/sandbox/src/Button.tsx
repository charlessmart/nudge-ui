import { type MouseEvent } from "react";

export function Button({
  label,
  onClick,
}: {
  label: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button className="btn" onClick={onClick}>
      <span className="btn__label">{label}</span>
    </button>
  );
}
