export interface ChipSprinkles {
  variant: "default" | "primary" | "success" | "warning" | "danger";
  size: "sm" | "md";
}

export function chipSprinkles({ variant, size }: ChipSprinkles): string {
  return [
    "semantic-chip",
    `semantic-chip--${variant}`,
    `semantic-chip--${size}`,
  ].join(" ");
}
