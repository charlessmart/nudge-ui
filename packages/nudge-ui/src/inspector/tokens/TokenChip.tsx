import type { HTMLAttributes, ReactElement } from "react";
import { TokenLabel } from "./TokenLabel.tsx";

export type TokenChipSize = "default" | "small";

export interface TokenChipProps extends HTMLAttributes<HTMLSpanElement> {
  size?: TokenChipSize;
  "data-test"?: string;
  "data-group"?: string;
}

interface TokenChipSlotProps extends HTMLAttributes<HTMLSpanElement> {
  "data-test"?: string;
}

function TokenChipRoot({ size = "default", className, children, ...props }: TokenChipProps): ReactElement {
  return (
    <span
      {...props}
      className={`token-chip token-chip--${size}${className ? ` ${className}` : ""}`}
    >
      {children}
    </span>
  );
}

function TokenChipPicker({ className, children, ...props }: TokenChipSlotProps): ReactElement {
  return (
    <span {...props} className={`token-chip__picker${className ? ` ${className}` : ""}`}>
      {children}
    </span>
  );
}

function TokenChipLabel({ className, children, ...props }: TokenChipSlotProps): ReactElement {
  return (
    <TokenLabel {...props} className={`token-chip__label${className ? ` ${className}` : ""}`}>
      {children}
    </TokenLabel>
  );
}

function TokenChipAction({ className, children, ...props }: TokenChipSlotProps): ReactElement {
  return (
    <span {...props} className={`token-chip__action${className ? ` ${className}` : ""}`}>
      {children}
    </span>
  );
}

/** Callers compose the slots; the chip owns visuals only. */
export const TokenChip = Object.assign(TokenChipRoot, {
  Picker: TokenChipPicker,
  Label: TokenChipLabel,
  Action: TokenChipAction,
});
