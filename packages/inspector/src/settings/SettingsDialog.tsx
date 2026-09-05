import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  IconColorSwatch,
  IconPlugConnected,
  IconSettings,
  IconX,
} from "@tabler/icons-react";
import { useBrowserCssInspection } from "../inspection/useBrowserCssInspection.ts";
import {
  McpConnectionContent,
  type McpConnectionContentProps,
} from "../agent/McpConnectionDialog.tsx";
import {
  PromptSettingsFields,
} from "../prompt/PromptSettingsDialog.tsx";
import { TokensPanel } from "../tokens/TokensPanel.tsx";

export type SettingsSection = "instructions" | "mcp" | "tokens";

interface SettingsSectionDefinition {
  readonly id: SettingsSection;
  readonly label: string;
  readonly icon: ReactElement;
}

const SETTINGS_SECTIONS: readonly SettingsSectionDefinition[] = [
  {
    id: "instructions",
    label: "Custom instructions",
    icon: <IconSettings size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />,
  },
  {
    id: "mcp",
    label: "MCP",
    icon: <IconPlugConnected size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />,
  },
  {
    id: "tokens",
    label: "Tokens",
    icon: <IconColorSwatch size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />,
  },
];

export interface SettingsDialogProps extends McpConnectionContentProps {
  readonly open: boolean;
  readonly initialSection: SettingsSection;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly onOpenChange: (open: boolean) => void;
}

function portalContainer(): HTMLElement | ShadowRoot | null {
  return typeof document !== "undefined"
    ? document.getElementById("nudge-ui-root")?.shadowRoot ?? document.body
    : null;
}

/** Provides one settings surface for prompt, MCP, and token configuration. */
export function SettingsDialog({
  open,
  initialSection,
  value,
  onValueChange,
  onOpenChange,
  projectId,
  origin,
  snapshot,
  onConnect,
  onDisconnect,
  onCheckAgain,
}: SettingsDialogProps): ReactElement {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
  const closeRef = useRef<HTMLButtonElement>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  const tokenInspection = useBrowserCssInspection(null, "base", {
    includeDocumentTokens: activeSection === "tokens",
  });
  const tokenRows = tokenInspection.documentTokens?.tokens ?? [];
  const activeDefinition = SETTINGS_SECTIONS.find((section) => section.id === activeSection) ?? SETTINGS_SECTIONS[0]!;

  useEffect(() => {
    if (open) setActiveSection(initialSection);
  }, [initialSection, open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={portalContainer()}>
        <Dialog.Backdrop className="settings__backdrop" data-test="settings-backdrop" />
        <Dialog.Popup
          className="settings__popup"
          data-test="settings-dialog"
          initialFocus={closeRef}
        >
          <Dialog.Title className="settings__visually-hidden">Settings</Dialog.Title>
          <Dialog.Description className="settings__visually-hidden">
            Configure how Nudge connects to your coding agent and uses your design system.
          </Dialog.Description>
          <Dialog.Close
            ref={closeRef}
            className="icon-button icon-button--quiet settings__close"
            aria-label="Close settings"
            data-test="settings-close"
            type="button"
          >
            <IconX size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
          </Dialog.Close>

          <div className="settings__body">
            <nav className="settings__nav" aria-label="Settings sections">
              <span className="settings__nav-label">Settings</span>
              <div className="settings__nav-items">
                {SETTINGS_SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    className={`settings__nav-item${activeSection === section.id ? " settings__nav-item--active" : ""}`}
                    data-test={`settings-nav-${section.id}`}
                    type="button"
                    aria-current={activeSection === section.id ? "page" : undefined}
                    onClick={() => setActiveSection(section.id)}
                  >
                    {section.icon}
                    <span className="settings__nav-item-label">{section.label}</span>
                  </button>
                ))}
              </div>
            </nav>

            <main className="settings__content" data-test="settings-content">
              {activeSection === "instructions" ? (
                <section
                  className="settings__section"
                  data-test="prompt-settings-dialog"
                  data-settings-section="instructions"
                >
                  <h2 className="settings__section-title">{activeDefinition.label}</h2>
                  <p className="settings__section-description">
                    These instructions are added to the end of every copied prompt.
                  </p>
                  <PromptSettingsFields
                    value={value}
                    onChange={onValueChange}
                    instructionsRef={instructionsRef}
                  />
                </section>
              ) : null}

              {activeSection === "mcp" ? (
                <section className="settings__section" data-test="settings-section-mcp">
                  <h2 className="settings__section-title">{activeDefinition.label}</h2>
                  <p className="settings__section-description">
                    Connect this page to your local coding agent through the Nudge MCP companion.
                  </p>
                  <div data-test="mcp-connection-dialog">
                    <McpConnectionContent
                      projectId={projectId}
                      origin={origin}
                      snapshot={snapshot}
                      onConnect={onConnect}
                      onDisconnect={onDisconnect}
                      onCheckAgain={onCheckAgain}
                    />
                  </div>
                </section>
              ) : null}

              {activeSection === "tokens" ? (
                <section className="settings__section" data-test="settings-section-tokens">
                  <h2 className="settings__section-title">{activeDefinition.label}</h2>
                  <p className="settings__section-description">
                    Inspect and edit the design tokens available in this page.
                  </p>
                  <TokensPanel rows={tokenRows} />
                </section>
              ) : null}
            </main>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
