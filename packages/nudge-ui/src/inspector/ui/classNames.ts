/** Joins truthy class names with spaces. */
export function cx(...classNames: ReadonlyArray<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}
