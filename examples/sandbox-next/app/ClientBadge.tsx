"use client";

export function ClientBadge({ label, tone }: { label: string; tone: "accent" | "quiet" }) {
  return (
    <span className={`badge badge-${tone}`} data-testid="client-badge">
      {label}
    </span>
  );
}
