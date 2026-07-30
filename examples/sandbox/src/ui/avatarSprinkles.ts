export interface AvatarSprinkles {
  variant: "initials" | "icon" | "image";
  size: "sm" | "md" | "lg" | "xl";
  shape: "circle" | "square";
}

export function avatarSprinkles({ variant, size, shape }: AvatarSprinkles): string {
  return [
    "semantic-avatar",
    `semantic-avatar--${variant}`,
    `semantic-avatar--${size}`,
    `semantic-avatar--${shape}`,
  ].join(" ");
}
