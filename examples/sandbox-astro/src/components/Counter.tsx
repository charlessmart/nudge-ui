import { useState } from "react";

interface CounterProps {
  label: string;
  variant?: "primary" | "ghost";
  disabled?: boolean;
}

/** Astro island roots are outside any transformed JSX, so the override boundary wraps the subtree from inside island source (ADR-0007). */
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

/** Island root hydrated via client:load; island JSX is instrumented by the shared Vite plugin. */
export default function Counter({ label, variant, disabled }: CounterProps) {
  return <IslandCounter label={label} variant={variant} disabled={disabled} />;
}
