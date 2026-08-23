import { useState } from "react";

interface CounterProps {
  label: string;
  variant?: "primary" | "ghost";
  disabled?: boolean;
}

/**
 * Inner island component: Astro creates island roots outside any transformed
 * JSX, so the shared React Adapter can only attach its override boundary to
 * uppercase invocations inside island source. Wrapping the whole subtree here
 * lets one typed override rerender every rendered artifact — classes, copy,
 * and the disabled control — through the real component (ADR-0007).
 */
function IslandCounter({ label, variant = "primary", disabled = false }: CounterProps) {
  const [count, setCount] = useState(0);

  return (
    <div className="counter">
      <p
        className={`counter-label counter-label--${variant}`}
        data-rendered-variant={variant}
      >
        {disabled ? `${label} (off)` : label}
      </p>
      <button
        type="button"
        className="counter-button"
        disabled={disabled}
        onClick={() => setCount((value) => value + 1)}
      >
        Clicks: {count}
      </button>
    </div>
  );
}

/** React island root: hydrates through client:load and carries the shared
 * React Adapter instrumentation injected into island JSX by the shared
 * Vite plugin. */
export default function Counter({ label, variant, disabled }: CounterProps) {
  return <IslandCounter label={label} variant={variant} disabled={disabled} />;
}
