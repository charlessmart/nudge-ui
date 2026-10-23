"use client";

export function ClientBadge({
  label,
  tone = "quiet",
  disabled = false,
}: {
  label: string;
  tone?: "accent" | "quiet";
  disabled?: boolean;
}) {
  return (
    <span
      className={`badge badge-${tone}${disabled ? " badge-disabled" : ""}`}
      data-testid="client-badge"
    >
      {label}
    </span>
  );
}
