import type { ReactElement } from "react";
import { IconClockPlay, IconLayersSelected, IconRuler } from "@tabler/icons-react";
import { ToolbarButton } from "./ToolbarButton.tsx";
import {
  setDebugOutlines,
  setAnimationDebug,
  setDebugXray,
  useAnimationDebug,
  useDebugViewState,
} from "./debugViewStore.ts";
import { ToolOptionsDrawer } from "./ToolOptionsDrawer.tsx";

const ICON_SIZE = "var(--icon-size-large)";

/** Animation, Outlines and Explode view that slide out beside the View options tool. */
export function DebugToolOptions({ open }: { readonly open: boolean }): ReactElement {
  const debug = useDebugViewState();
  const animation = useAnimationDebug();
  return (
    <ToolOptionsDrawer name="debug" open={open} label="View options">
      {({ hidden }) => (
        <>
          <ToolbarButton
            label="Animation"
            activeStyle="well"
            active={animation.enabled}
            hidden={hidden}
            dataTest="debug-tool-animation"
            icon={<IconClockPlay size={ICON_SIZE} stroke="var(--icon-stroke-width)" aria-hidden="true" />}
            onClick={() => setAnimationDebug({ enabled: !animation.enabled })}
          />
          <ToolbarButton
            label="Outlines"
            activeStyle="well"
            active={debug.outlines}
            hidden={hidden}
            dataTest="debug-tool-outlines"
            icon={<IconRuler size={ICON_SIZE} stroke="var(--icon-stroke-width)" aria-hidden="true" />}
            onClick={() => setDebugOutlines(!debug.outlines)}
          />
          <ToolbarButton
            label="Explode view"
            activeStyle="well"
            active={debug.xray}
            hidden={hidden}
            dataTest="debug-tool-xray"
            icon={<IconLayersSelected size={ICON_SIZE} stroke="var(--icon-stroke-width)" aria-hidden="true" />}
            onClick={() => setDebugXray(!debug.xray)}
          />
        </>
      )}
    </ToolOptionsDrawer>
  );
}
