export interface ButtonSprinkles {
  variant: "primary" | "secondary";
  size: "small" | "large";
}

/**
 * Sandbox stand-in for the class contract an internal Vanilla Extract
 * Sprinkles package exports. The semantic editor cares about the component
 * prop contract; the existing Vanilla Extract adapter remains responsible for
 * explaining the generated classes and tokens.
 */
export function buttonSprinkles({ variant, size }: ButtonSprinkles): string {
  return [
    "semantic-button",
    `semantic-button--${variant}`,
    `semantic-button--${size}`,
  ].join(" ");
}
