import { ANIMATION_CLOCK_SCRIPT } from "./animationClock.ts";
import { FLOW_SCENARIO_SCRIPT } from "./flowScenario.ts";

/** What every host puts first in a development document's `<head>`, ahead of the application's own scripts. */
export const DOCUMENT_HEAD_SCRIPT = `${ANIMATION_CLOCK_SCRIPT}\n${FLOW_SCENARIO_SCRIPT}`;
