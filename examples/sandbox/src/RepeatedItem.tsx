export function RepeatedItem({ label }: { label: string }) {
  // Deliberately does not accept or forward unknown props. The host element's
  // definition-site instrumentation must remain sufficient for selection.
  return <button className="repeated-item">{label}</button>;
}
