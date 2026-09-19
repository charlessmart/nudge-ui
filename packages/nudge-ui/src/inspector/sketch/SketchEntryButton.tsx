import type { ReactElement } from "react";
import { IconPencil } from "@tabler/icons-react";
import { Button } from "../ui/Button.tsx";
import { isInlineTextEditingActive } from "../inline-text/inlineTextEditor.ts";
import { useSketchInteractionActive } from "./interaction.ts";
import { startSketchCapture } from "./SketchWorkspace.tsx";

export function SketchEntryButton({ hostElement }: { readonly hostElement: HTMLElement | null }): ReactElement {
  const active = useSketchInteractionActive();
  const disabled = active || isInlineTextEditingActive();
  return (
    <Button
      variant="quiet"
      size="compact"
      className="panel__sketch-button"
      type="button"
      data-test="sketch-entry"
      aria-label="Sketch viewport"
      title="Sketch viewport"
      disabled={disabled || !hostElement}
      onClick={() => startSketchCapture(hostElement)}
    >
      <IconPencil size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
      <span className="panel__sketch-label">Sketch</span>
    </Button>
  );
}
