export interface AlertSprinkles {
  variant: "info" | "success" | "warning" | "danger";
}

export function alertSprinkles({ variant }: AlertSprinkles): string {
  return [
    "semantic-alert",
    `semantic-alert--${variant}`,
  ].join(" ");
}
