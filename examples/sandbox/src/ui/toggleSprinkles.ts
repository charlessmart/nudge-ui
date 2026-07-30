export interface ToggleSprinkles {
  variant: "accent" | "success" | "danger";
  size: "sm" | "md" | "lg";
}

export function toggleSprinkles({ variant, size }: ToggleSprinkles): string {
  return [
    "semantic-toggle",
    `semantic-toggle--${variant}`,
    `semantic-toggle--${size}`,
  ].join(" ");
}
