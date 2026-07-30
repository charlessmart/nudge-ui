export interface BadgeSprinkles {
  variant: "neutral" | "success" | "warning" | "danger" | "info";
  size: "sm" | "md" | "lg";
}

export function badgeSprinkles({ variant, size }: BadgeSprinkles): string {
  return [
    "semantic-badge",
    `semantic-badge--${variant}`,
    `semantic-badge--${size}`,
  ].join(" ");
}
