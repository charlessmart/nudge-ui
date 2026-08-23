import { useState } from "react";

interface CounterProps {
  label: string;
}

/** React island: hydrates through client:load and carries the shared
 * React Adapter instrumentation injected into island JSX by the shared
 * Vite plugin. */
export default function Counter({ label }: CounterProps) {
  const [count, setCount] = useState(0);

  return (
    <div className="counter">
      <p className="counter-label">{label}</p>
      <button type="button" className="counter-button" onClick={() => setCount((value) => value + 1)}>
        Clicks: {count}
      </button>
    </div>
  );
}
