import type { CSSProperties, ReactNode } from "react";
import { IconBackspace, IconCheck, IconCopy, IconPointer } from "@tabler/icons-react";
import { ChatThread } from "./ChatThread";
import { DemoStage } from "./DemoStage";
import { type Field, type Scene, useTweened } from "./demoScene";

export function NudgeMark({ size = 14 }: { size?: number }): ReactNode {
  return (
    <svg viewBox="5 4 35 35" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M14.7742 6C27.6015 6 38 16.569 38 29.6066V38H30.7742V29.6066C30.7742 20.6251 23.6107 13.3443 14.7742 13.3443H13.2258V38H6V6H14.7742Z" />
      <path d="M39 15.6629C37 11.5 33 7 28.4919 5H39V15.6629Z" />
    </svg>
  );
}

const SELECTION_NAMES = {
  card: "div.card",
  thread: "div.thread",
  chip: "span.chip",
  title: "h3.title",
  button: "button.cta",
} as const;

function DockSlider({ id, label, value, max }: { id: string; label: string; value: number; max: number }): ReactNode {
  const shown = useTweened(value);
  return (
    <div className="hm-dock-slider" data-t={id}>
      <span className="hm-dock-label">{label}</span>
      <span
        className="hm-dock-track"
        // SAFETY: Custom property keys are absent from React's CSSProperties, so object literals carrying them require a cast.
        style={{ "--hm-fill": `${Math.min(shown / max, 1) * 100}%` } as CSSProperties}
      >
        <i className="hm-dock-thumb" />
      </span>
      <span className="hm-dock-value">{Math.round(shown)}</span>
    </div>
  );
}

function DockField({ field, scene }: { field: Field | null; scene: Scene }): ReactNode {
  if (field === "padding") return <DockSlider id="padControl" label="Padding" value={scene.pad} max={48} />;
  if (field === "gap") return <DockSlider id="gapControl" label="Gap" value={scene.gap} max={48} />;
  if (field === "delete") {
    return (
      <div className="hm-dock-delete">
        <span className="hm-dock-key"><IconBackspace size={14} stroke={1.8} /> Delete</span>
        <span className="hm-dock-hint">{scene.chipGone ? "Removed “Skip intro”" : "Remove “Skip intro”"}</span>
      </div>
    );
  }
  if (field === "text") {
    return (
      <div className="hm-dock-text">
        <span className="hm-dock-label">Text</span>
        <span className="hm-dock-input">{scene.title}{scene.editing ? <i className="hm-caret" /> : null}</span>
      </div>
    );
  }
  if (field === "background") {
    return (
      <div className="hm-dock-bg" data-t="bgControl">
        <span className="hm-dock-label">Background</span>
        <span className="hm-dock-swatch" data-brand={scene.brandButton || undefined} />
        <span className="hm-dock-value hm-dock-value--wide">{scene.brandButton ? "brand-primary" : "#242424"}</span>
      </div>
    );
  }
  return (
    <div className="hm-dock-idle">
      <IconPointer size={15} stroke={1.7} />
      Click anything to edit it
    </div>
  );
}

function Dock({ scene }: { scene: Scene }): ReactNode {
  return (
    <div className="hm-dock">
      <div className="hm-dock-top">
        <span className="hm-dock-logo"><NudgeMark size={13} /></span>
        <span className="hm-dock-element">{scene.selected ? SELECTION_NAMES[scene.selected] : "Nudge"}</span>
        <span className="hm-dock-count" data-has-changes={scene.changes > 0}>
          {scene.changes === 0 ? "No changes" : `${scene.changes} ${scene.changes === 1 ? "change" : "changes"}`}
        </span>
      </div>
      <div className="hm-dock-field" key={scene.field ?? "idle"}>
        <DockField field={scene.field} scene={scene} />
      </div>
      <span className="hm-dock-copy" data-t="copy" data-ready={scene.changes > 0}>
        {scene.toast ? <IconCheck size={14} stroke={2} /> : <IconCopy size={14} stroke={1.7} />}
        {scene.toast ? "Prompt copied" : "Copy prompt"}
      </span>
    </div>
  );
}

/** Small chat thread with a floating Nudge dock — the quick, simplified edit story. */
export function NarrowMock(): ReactNode {
  return (
    <DemoStage width={372} height={612} className="hm-stage--narrow">
      {(scene) => (
        <>
          <ChatThread scene={scene} />
          <Dock scene={scene} />
        </>
      )}
    </DemoStage>
  );
}
