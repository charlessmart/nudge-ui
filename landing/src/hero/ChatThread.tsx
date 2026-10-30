import type { CSSProperties, ReactNode } from "react";
import { IconArrowUp, IconSparkles } from "@tabler/icons-react";
import type { Scene } from "./demoScene";

/** The AI chat thread that gets edited in the hero demos. `data-t` marks the elements the cursor can aim at. */
export function ChatThread({ scene, frameless = false }: { scene: Scene; frameless?: boolean }): ReactNode {
  return (
    <div className="hm-chat" data-frameless={frameless || undefined}>
      <header className="hm-chat-head">
        <span className="hm-chat-avatar" aria-hidden="true"><IconSparkles size={14} stroke={1.8} /></span>
        <span className="hm-chat-name">Onboarding helper</span>
        <span className="hm-chat-status" aria-hidden="true" />
      </header>

      <div
        className="hm-thread"
        data-t="thread"
        // SAFETY: Custom property keys are absent from React's CSSProperties, so object literals carrying them require a cast.
        style={{ "--hm-gap": `${scene.gap}px` } as CSSProperties}
      >
        <div className="hm-msg hm-msg--user" data-t="userMsg">
          <p>Can you redesign my onboarding checklist?</p>
        </div>

        <div className="hm-msg hm-msg--bot" data-t="botMsg">
          <span className="hm-chat-avatar hm-chat-avatar--small" aria-hidden="true"><IconSparkles size={12} stroke={1.8} /></span>
          <p>Here&apos;s a first pass. I kept the steps short and focused.</p>
        </div>

        <div className="hm-msg hm-msg--bot hm-msg--card" data-t="cardRow">
          <span className="hm-chat-avatar hm-chat-avatar--small hm-chat-avatar--ghost" aria-hidden="true" />
          <div className="hm-card" data-t="card" style={{ padding: `${scene.pad}px` }}>
            <h3 className="hm-card-title" data-t="title" data-editing={scene.editing || undefined}>
              <span className="hm-card-title-text" data-selected={scene.titleSelected || undefined}>{scene.title}</span>
              {scene.editing ? <span className="hm-caret" aria-hidden="true" /> : null}
            </h3>
            <div className="hm-chips">
              <span className="hm-chip">Invite team</span>
              <span className="hm-chip">Connect repo</span>
              <span className="hm-chip" data-t="chip" data-gone={scene.chipGone || undefined}>Skip intro</span>
            </div>
            <span className="hm-cta" data-t="button" data-brand={scene.brandButton || undefined}>Continue</span>
          </div>
        </div>
      </div>

      <div className="hm-chat-input" aria-hidden="true">
        <span>Reply to Onboarding helper…</span>
        <span className="hm-chat-send"><IconArrowUp size={14} stroke={2} /></span>
      </div>
    </div>
  );
}
