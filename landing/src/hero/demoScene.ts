import { useEffect, useState } from "react";

export type Field = "padding" | "gap" | "delete" | "text" | "background";
export type SelectableId = "card" | "thread" | "chip" | "title" | "button";

export type Scene = {
  /** Where the cursor is heading; null parks it off-stage. */
  target: CursorTarget | null;
  hover: SelectableId | null;
  selected: SelectableId | null;
  field: Field | null;
  pad: number;
  gap: number;
  chipGone: boolean;
  title: string;
  titleSelected: boolean;
  editing: boolean;
  brandButton: boolean;
  pressed: boolean;
  changes: number;
  toast: boolean;
};

export type CursorTarget = { id: string; fx?: number; fy?: number; dx?: number; dy?: number };

export const INITIAL_SCENE: Scene = {
  target: null,
  hover: null,
  selected: null,
  field: null,
  pad: 12,
  gap: 10,
  chipGone: false,
  title: "Set up your workspace",
  titleSelected: false,
  editing: false,
  brandButton: false,
  pressed: false,
  changes: 0,
  toast: false,
};

export const FINAL_SCENE: Scene = {
  ...INITIAL_SCENE,
  pad: 16,
  gap: 14,
  chipGone: true,
  title: "Let's get you started",
  brandButton: true,
  changes: 5,
};

const NEW_TITLE = "Let's get you started";
const LOOP_REST_MS = 2600;

type Step = readonly [at: number, patch: Partial<Scene>];

function at(id: string, fx = 0.5, fy = 0.5, dx = 0, dy = 0): CursorTarget {
  return { id, fx, fy, dx, dy };
}

function click(time: number, patch: Partial<Scene> = {}): Step[] {
  return [
    [time, { pressed: true }],
    [time + 140, { pressed: false, ...patch }],
  ];
}

/** One pass of the edit story: padding, gap, delete, text, brand colour, hand off. */
function buildScript(): { steps: Step[]; length: number } {
  const steps: Step[] = [
    [0, { target: at("card", 0.62, 0.42), hover: "card" }],
    ...click(1500, { selected: "card", field: "padding", hover: null }),
    [2000, { target: at("padControl", 0.5, 0.5) }],
    [2900, { pressed: true }],
    [3050, { pad: 30, changes: 1 }],
    [3900, { pad: 16 }],
    [4300, { pressed: false }],

    [4900, { target: at("userMsg", 0.5, 1, 0, 6), hover: "thread" }],
    ...click(5900, { selected: "thread", field: "gap", hover: null }),
    [6300, { target: at("gapControl", 0.5, 0.5) }],
    [7100, { pressed: true }],
    [7250, { gap: 24, changes: 2 }],
    [8000, { gap: 14 }],
    [8400, { pressed: false }],

    [8900, { target: at("chip", 0.5, 0.5), hover: "chip" }],
    ...click(9900, { selected: "chip", field: "delete", hover: null }),
    [10700, { chipGone: true, changes: 3 }],

    [11400, { target: at("title", 0.4, 0.5), hover: "title" }],
    ...click(12300, { selected: "title", field: "text", hover: null }),
    ...click(12600, { editing: true, titleSelected: true }),
  ];

  let time = 13300;
  for (let index = 1; index <= NEW_TITLE.length; index += 1) {
    const typed = NEW_TITLE.slice(0, index);
    steps.push([time, index === 1 ? { title: typed, titleSelected: false } : { title: typed }]);
    time += 55;
  }
  steps.push([time + 200, { editing: false, changes: 4 }]);

  time += 900;
  steps.push([time, { target: at("button", 0.5, 0.5), hover: "button" }]);
  steps.push(...click(time + 900, { selected: "button", field: "background", hover: null }));
  steps.push([time + 1300, { target: at("bgControl", 0.5, 0.5) }]);
  steps.push(...click(time + 2100, { brandButton: true, changes: 5 }));

  steps.push([time + 3200, { target: at("copy", 0.5, 0.5) }]);
  steps.push(...click(time + 4100, { toast: true }));
  const length = time + 4100 + 3000;
  return { steps, length };
}

const SCRIPT = buildScript();

/** Replays the scripted edit loop while `active`, or parks on the finished edit for reduced motion. */
export function useScene(active: boolean, reducedMotion: boolean): Scene {
  const [scene, setScene] = useState<Scene>(reducedMotion ? FINAL_SCENE : INITIAL_SCENE);

  useEffect(() => {
    if (reducedMotion) {
      setScene(FINAL_SCENE);
      return;
    }
    if (!active) return;

    let timers: number[] = [];
    const run = () => {
      setScene(INITIAL_SCENE);
      timers = SCRIPT.steps.map(([time, patch]) => window.setTimeout(() => {
        setScene((current) => ({ ...current, ...patch }));
      }, time + 400));
      timers.push(window.setTimeout(() => {
        setScene((current) => ({ ...current, target: null, selected: null, field: null }));
      }, SCRIPT.length + 400 - 1200));
      timers.push(window.setTimeout(run, SCRIPT.length + LOOP_REST_MS));
    };
    run();

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [active, reducedMotion]);

  return scene;
}

/** Eases a number toward its target so field readouts tick like the real inspector. */
export function useTweened(target: number, duration = 520): number {
  const [value, setValue] = useState(target);

  useEffect(() => {
    const from = value;
    if (from === target) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setValue(from + (target - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // The tween restarts from wherever it currently is, so `value` is read once per target change.
  }, [target, duration]);

  return value;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}
