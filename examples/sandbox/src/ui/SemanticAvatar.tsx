import { avatarSprinkles } from "./avatarSprinkles";

export interface SemanticAvatarProps {
  variant: "initials" | "icon" | "image";
  size: "sm" | "md" | "lg" | "xl";
  shape: "circle" | "square";
}

export function SemanticAvatar({ variant, size, shape }: SemanticAvatarProps) {
  const initials = variant === "initials" ? "JD" : null;
  const iconLabel = variant === "icon" ? "\u{1F464}" : null;
  const imageLabel = variant === "image" ? "\u{1F5BC}" : null;

  return (
    <span
      className={avatarSprinkles({ variant, size, shape })}
      role="img"
      aria-label="Avatar"
      data-test="semantic-avatar"
      data-rendered-variant={variant}
      data-rendered-size={size}
      data-rendered-shape={shape}
    >
      {initials}
      {iconLabel}
      {imageLabel}
    </span>
  );
}
