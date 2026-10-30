import type { ReactNode } from "react";
import {
  IconArrowUpRight,
  IconChevronDown,
  IconCheck,
  IconCopy,
  IconLayoutSidebarRight,
  IconMessage,
  IconPlus,
  IconSettings,
  IconStack2,
} from "@tabler/icons-react";
import { ChatThread } from "./ChatThread";
import { DemoStage } from "./DemoStage";
import { type Scene, type SelectableId, useTweened } from "./demoScene";
import { NudgeMark } from "./NarrowMock";

const SELECTION_NAMES: Record<SelectableId, string> = {
  card: "div.card",
  thread: "div.thread",
  chip: "span.chip",
  title: "h3.title",
  button: "button.cta",
};

const CONVERSATIONS = ["Onboarding checklist", "Pricing page copy", "Empty states", "Settings layout", "Release notes"];

function PanelField({ label, value, active, id, flex = 1 }: { label?: ReactNode; value: ReactNode; active?: boolean; id?: string; flex?: number }): ReactNode {
  return (
    <span className="hm-pfield" data-active={active || undefined} data-t={id} style={{ flex }}>
      {label ? <span className="hm-pfield-label">{label}</span> : null}
      <span className="hm-pfield-value">{value}</span>
    </span>
  );
}

function ChangeLine({ children, visible }: { children: ReactNode; visible: boolean }): ReactNode {
  return <li className="hm-change" data-visible={visible}>{children}</li>;
}

function NudgePanel({ scene }: { scene: Scene }): ReactNode {
  const pad = Math.round(useTweened(scene.pad));
  const gap = Math.round(useTweened(scene.gap));
  const selected = scene.selected;

  return (
    <aside className="hm-panel">
      <div className="hm-panel-top">
        <span className="hm-panel-icon"><IconLayoutSidebarRight size={16} stroke={1.5} /></span>
        <span className="hm-panel-spacer" />
        <span className="hm-panel-icon"><NudgeMark size={15} /></span>
        <span className="hm-panel-icon"><IconSettings size={16} stroke={1.5} /></span>
        <span className="hm-panel-divider" />
        <span className="hm-panel-canvas">Canvas <IconArrowUpRight size={14} stroke={1.6} /></span>
      </div>

      <span className="hm-panel-copy" data-t="copy" data-ready={scene.changes > 0}>
        {scene.toast ? <IconCheck size={15} stroke={2} /> : <IconCopy size={15} stroke={1.6} />}
        {scene.toast ? "Prompt copied" : "Copy prompt"}
      </span>

      <div className="hm-panel-selection">
        <span className="hm-panel-selection-name">{selected ? SELECTION_NAMES[selected] : "Nothing selected"}</span>
        <span className="hm-panel-selection-meta">{selected ? "src/Checklist.tsx" : "Click an element"}</span>
      </div>

      <section className="hm-psection">
        <h4>Layout</h4>
        <div className="hm-prow">
          <PanelField label="W" value="auto" />
          <PanelField label="H" value="auto" />
        </div>
      </section>

      <section className="hm-psection">
        <h4>Spacing</h4>
        <div className="hm-plabel">Padding</div>
        <div className="hm-prow" data-t="padControl">
          <PanelField label="↔" value={pad} active={scene.field === "padding"} />
          <PanelField label="↕" value={pad} active={scene.field === "padding"} />
        </div>
        <div className="hm-plabel">Gap</div>
        <div className="hm-prow">
          <PanelField id="gapControl" label="⇅" value={gap} active={scene.field === "gap"} flex={1} />
          <span className="hm-pfield-spacer" />
        </div>
      </section>

      <section className="hm-psection">
        <h4>Appearance</h4>
        <div className="hm-prow">
          <PanelField
            id="bgControl"
            active={scene.field === "background"}
            value={(
              <>
                <i className="hm-pswatch" data-brand={scene.brandButton || undefined} />
                {scene.brandButton ? "brand-primary" : "#242424"}
              </>
            )}
          />
          <PanelField label="R" value="12" flex={0.7} />
        </div>
      </section>

      <section className="hm-psection">
        <h4>Text</h4>
        <div className="hm-prow">
          <PanelField
            active={scene.field === "text"}
            value={<span className="hm-ptext">{scene.title}{scene.editing ? <i className="hm-caret" /> : null}</span>}
          />
        </div>
      </section>

      <section className="hm-psection hm-psection--changes">
        <h4>Changes <span className="hm-pcount" data-has-changes={scene.changes > 0}>{scene.changes}</span></h4>
        <ul className="hm-changes">
          <ChangeLine visible={scene.changes >= 1}><b>Padding</b> 12 → 16 <em>div.card</em></ChangeLine>
          <ChangeLine visible={scene.changes >= 2}><b>Gap</b> 10 → 14 <em>div.thread</em></ChangeLine>
          <ChangeLine visible={scene.changes >= 3}><b>Delete</b> <em>span.chip</em> “Skip intro”</ChangeLine>
          <ChangeLine visible={scene.changes >= 4}><b>Text</b> “Let&apos;s get you started”</ChangeLine>
          <ChangeLine visible={scene.changes >= 5}><b>Background</b> brand-primary <em>button.cta</em></ChangeLine>
        </ul>
      </section>
    </aside>
  );
}

function AppSidebar(): ReactNode {
  return (
    <nav className="hm-appnav">
      <span className="hm-appnav-new"><IconPlus size={14} stroke={1.8} /> New chat</span>
      <span className="hm-appnav-heading">Recent</span>
      {CONVERSATIONS.map((name, index) => (
        <span className="hm-appnav-item" key={name} data-current={index === 0 || undefined}>
          <IconMessage size={14} stroke={1.6} />
          {name}
        </span>
      ))}
      <span className="hm-appnav-footer"><IconStack2 size={14} stroke={1.6} /> Workspace <IconChevronDown size={12} stroke={1.8} /></span>
    </nav>
  );
}

/** A widescreen browser window: a chat app in the middle, the Nudge panel docked on the right. */
export function FullMock(): ReactNode {
  return (
    <DemoStage width={1200} height={740} className="hm-stage--full" maxScale={1.15}>
      {(scene) => (
        <div className="hm-window">
          <div className="hm-window-bar">
            <span className="hm-window-dots"><i /><i /><i /></span>
            <span className="hm-window-url">localhost:3000/chat</span>
          </div>
          <div className="hm-window-body">
            <AppSidebar />
            <div className="hm-appmain">
              <ChatThread scene={scene} frameless />
            </div>
            <NudgePanel scene={scene} />
          </div>
        </div>
      )}
    </DemoStage>
  );
}
