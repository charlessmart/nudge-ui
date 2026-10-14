export function colorWithAlpha(color: string, alpha: number): string {
  return `color-mix(in srgb, ${color} ${alpha}%, transparent)`;
}
