import { useRef, useState } from "react";
import type { ReactElement } from "react";
import { ColorSwatch } from "../ui/ColorSwatch.tsx";
import { ColorPickerPanel } from "../ui/ColorPickerPanel.tsx";
import { InspectorPopover } from "../ui/InspectorPopover.tsx";
import { createChangeHistoryGroup } from "../workspace/timeline.ts";

export interface ColorSwatchPickerProps {
  /** The color the swatch paints; null when it cannot be resolved. */
  swatchColor: string | null;
  /** The value the picker opens on. */
  value: string;
  /** The written value, whose syntax picks the format the picker opens in. */
  authored?: string;
  disabled?: boolean;
  onChange(value: string): void;
}

/** A field's leading swatch, opening the color picker beside the inspector. */
export function ColorSwatchPicker({ swatchColor, value, authored, disabled = false, onChange }: ColorSwatchPickerProps): ReactElement {
  const [open, setOpen] = useState(false);
  // One drag across the surface or a slider is one undo step.
  const dragGroup = useRef<ReturnType<typeof createChangeHistoryGroup> | null>(null);

  return (
    <InspectorPopover
      open={open && !disabled}
      onOpenChange={setOpen}
      side="left"
      align="start"
      sideOffset={12}
      popupClassName="inspector-popover__popup--fit"
      data-test="token-color-picker"
      triggerElement={(
        <button
          type="button"
          className="token-color-control"
          data-test="token-color-input"
          data-resolved={swatchColor !== null ? "true" : "false"}
          aria-label="Choose color"
          disabled={disabled}
        >
          <ColorSwatch color={swatchColor ?? "transparent"} data-test="token-color-swatch" />
        </button>
      )}
    >
      <ColorPickerPanel
        value={value}
        formatHint={authored}
        disabled={disabled}
        onDragStateChange={(dragging) => {
          dragGroup.current = dragging ? createChangeHistoryGroup() : null;
        }}
        onChange={(next) => {
          const group = dragGroup.current;
          if (group) group(() => onChange(next));
          else onChange(next);
        }}
      />
    </InspectorPopover>
  );
}
