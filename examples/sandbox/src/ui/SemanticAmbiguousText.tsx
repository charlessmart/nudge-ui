export interface SemanticAmbiguousTextProps {
  first: string;
  second: string;
}

/** Dev fixture: both visible-text props intentionally carry the same value. */
export function SemanticAmbiguousText({ first, second }: SemanticAmbiguousTextProps) {
  return (
    <span className="semantic-ambiguous-text" data-test="semantic-ambiguous-text">
      <span data-test="semantic-ambiguous-first">{first}</span>
      <span aria-hidden="true"> / </span>
      <span data-test="semantic-ambiguous-second">{second}</span>
    </span>
  );
}
