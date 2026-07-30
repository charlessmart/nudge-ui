export interface CardSprinkles {
  variant: "elevated" | "outlined" | "flat";
  padding: "sm" | "md" | "lg";
  bordered?: boolean;
}

export function cardSprinkles({ variant, padding, bordered }: CardSprinkles): string {
  const classes = [
    "semantic-card",
    `semantic-card--${variant}`,
    `semantic-card--${padding}`,
  ];
  if (bordered) classes.push("semantic-card--bordered");
  return classes.join(" ");
}
