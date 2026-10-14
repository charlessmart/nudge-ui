export interface ButtonSprinkles {
  variant: "primary" | "secondary";
  size: "small" | "large";
}

// Sandbox stand-in for an internal Vanilla Extract Sprinkles contract; the semantic editor only cares about the prop contract.
export function buttonSprinkles({ variant, size }: ButtonSprinkles): string {
  return [
    "semantic-button",
    `semantic-button--${variant}`,
    `semantic-button--${size}`,
  ].join(" ");
}
