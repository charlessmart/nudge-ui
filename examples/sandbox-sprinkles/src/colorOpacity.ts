/** Build a token-preserving CSS color with a named alpha percentage. */
export function colorWithAlpha(color: string, alpha: number): string {
  return `color-mix(in srgb, ${color} ${alpha}%, transparent)`;
}
