export interface WorkbenchBadgeProps {
  label: string;
  tone: "neutral" | "success" | "warning" | "danger";
  size: "small" | "large";
}

export function WorkbenchBadge({ label, tone, size }: WorkbenchBadgeProps) {
  return <span className={`wb-badge wb-badge--${tone} wb-badge--${size}`}>{label}</span>;
}
