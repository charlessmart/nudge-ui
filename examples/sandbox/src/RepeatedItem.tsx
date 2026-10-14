export function RepeatedItem({ label }: { label: string }) {
  // Deliberately accepts no extra props: definition-site instrumentation must stay sufficient for selection.
  return <button className="repeated-item">{label}</button>;
}
