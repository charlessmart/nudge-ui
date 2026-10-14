/**
 * Identity attributes the compiler adds to every instrumented JSX element.
 * The runtime reads the same names back from component props, so both sides
 * import them from here.
 */
export const IDENTITY_ATTRIBUTES = ["data-cid", "data-src", "data-cprops"] as const;
