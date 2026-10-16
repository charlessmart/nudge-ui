import { useLayoutEffect, useMemo, useState, type ReactElement } from "react";
import { InspectorPanel } from "@inspector/shell/InspectorPanel.tsx";
import { InspectorSelection } from "@inspector/shell/InspectorSelection.tsx";
import { describeElement } from "@inspector/shell/elementName.ts";
import { InspectorEditors } from "@inspector/shell/InspectorEditors.tsx";
import { ComponentPropsSection, useComponentProps } from "@inspector/componentSemantics/ComponentPropsSection.tsx";
import { EmptyState } from "@inspector/shell/EmptyState.tsx";
import { AgentStatusButtonView } from "@inspector/shell/AgentStatusButton.tsx";
import { PromptActionButton } from "@inspector/shell/PromptActionButton.tsx";
import { clearActiveDraft, useChanges } from "@inspector/drafts/store.ts";
import { setStyle } from "@inspector/tokens/editActions.ts";
import { setActiveStyleState } from "@inspector/shell/styleState.ts";
import { PeekOriginalButton } from "@inspector/shell/PeekOriginalButton.tsx";
import { ChangesLog } from "@inspector/shell/ChangesLog.tsx";
import { DRAG_CURSOR_STYLES } from "@inspector/ui/dragCursor.ts";
import { TooltipGroup } from "@inspector/ui/Tooltip.tsx";
import { StatusCallout } from "@inspector/ui/StatusCallout.tsx";
import { useBrowserCssInspection } from "@inspector/inspection/useBrowserCssInspection.ts";
import { resolveSelectionFromElement } from "@inspector/selection/resolveSelection.ts";
import type { SelectedElement } from "@inspector/selection/selectionStore.ts";
import { createStyleSelection } from "@inspector/selection/styleSelection.ts";
import { intersectTokenEntries } from "@inspector/inspection/selectionProperty.ts";
import { isTextRelevant } from "@inspector/styleEditors/textRelevance.ts";
import { findTokenRow } from "@inspector/styleEditors/rowLookup.ts";
import type { InteractionState } from "@inspector/shell/styleState.ts";
import { ComponentExamples, FixtureTargets } from "./FixtureTargets.tsx";
import { ControlledFields } from "./ControlledFields.tsx";
import { agentFixture, scenarios, type Scenario } from "./scenarios.ts";

function FixturePanel({ scenario }: { scenario: Scenario }): ReactElement {
  const [isOpen, setOpen] = useState(true);
  const [scope, setScope] = useState(scenario.scope ?? null);
  const [styleState, setStyleState] = useState<InteractionState>("base");
  const [targets, setTargets] = useState<SelectedElement[]>([]);
  const changes = useChanges();
  const [notice, setNotice] = useState<string | null>(null);
  useLayoutEffect(() => {
    clearActiveDraft();
    setActiveStyleState("base");
    const nodes = [...document.querySelectorAll<HTMLElement>(`[data-fixture="${scenario.target}"]`)]
      .map((node) => (node.dataset.fixtureSelect ? node.querySelector<HTMLElement>(node.dataset.fixtureSelect) : null) ?? node);
    const selected = nodes.map(resolveSelectionFromElement).filter((value): value is SelectedElement => value !== null);
    setTargets(scenario.target === "mixed" ? selected : selected.slice(0, 1));
    if (scenario.id === "changes" && selected[0]) {
      setStyle(selected[0].domElement, "font-size", "32px");
      setStyle(selected[0].domElement, "padding", "32px");
    }
    return () => { clearActiveDraft(); setActiveStyleState("base"); };
  }, [scenario.id, scenario.target]);
  const inspection = useBrowserCssInspection(targets, styleState);
  const primary = targets[0] ?? null;
  const componentProps = useComponentProps(primary);
  const selection = useMemo(() => createStyleSelection(targets, inspection.elements, primary), [targets, inspection.elements, primary]);
  const rows = useMemo(() => [...(selection?.primaryRows ?? [])], [selection]);
  const entries = useMemo(() => intersectTokenEntries(inspection.elements.map((snapshot) => snapshot.availableTokens)), [inspection.elements]);
  const showText = targets.length > 0 && targets.every((target, index) => isTextRelevant(target.domElement, inspection.elements[index]?.properties ?? []));

  return <TooltipGroup>
    <InspectorPanel
      isOpen={isOpen} onOpenChange={setOpen}
      headerActions={<><PeekOriginalButton /><AgentStatusButtonView agent={agentFixture(scenario.connected ?? false)} onOpenSettings={() => setNotice("Fixture agent status. Use the outer inspector to configure your real connection.")} /></>}
      prompt={<div className="copy-prompt__stack" data-test="copy-prompt-control">
        <PromptActionButton disabled={changes.length === 0} badgeCount={changes.length} onClick={() => setNotice("Fixture prompt action. Use the outer inspector’s Copy prompt button to export your design changes.")} />
      </div>}
    >
      {notice ? <StatusCallout tone="neutral" role="status">{notice}</StatusCallout> : null}
      {scenario.error ? <StatusCallout tone="danger" data-test="page-inspection-error" role="status">Can’t load Nudge on this page due to {scenario.error}.</StatusCallout>
        : scenario.target === "controls" ? <ControlledFields />
          : primary ? <>
            <InspectorSelection
              identity={primary} count={targets.length} name={componentProps ? { title: componentProps.target.meta.componentName } : describeElement(primary.domElement)} editScope={scope}
              sourceSiteMatchCount={scope === "source-site" ? 3 : 1}
              styleState={styleState} availableInteractionStates={inspection.element?.availableStates ?? ["base"]}
              onStyleStateChange={(state) => { setActiveStyleState(state); setStyleState(state); }} onUnlink={() => setScope("rendered-instance")} onRelink={() => setScope("source-site")}
            >
              {targets.length === 1 ? <ComponentPropsSection selected={primary} /> : null}
            </InspectorSelection>
            <InspectorEditors selected={primary} styleSelection={selection} tokenEntries={entries} tokenRows={rows} styleState={styleState} showText={showText} backgroundTokenRow={findTokenRow(rows, "background-color")} />
          </> : <EmptyState />}
      <ChangesLog />
    </InspectorPanel>
  </TooltipGroup>;
}

export function Workbench(): ReactElement {
  const initial = new URLSearchParams(location.search).get("scenario");
  const [scenarioId, setScenarioId] = useState(scenarios.find((scenario) => scenario.id === initial)?.id ?? "typography");
  const [revision, setRevision] = useState(0);
  const scenario = scenarios.find((candidate) => candidate.id === scenarioId)!;
  function choose(id: string): void {
    setScenarioId(id);
    const url = new URL(location.href);
    url.searchParams.set("scenario", id);
    history.replaceState(null, "", url);
  }
  return <main className="workbench">
    <style>{DRAG_CURSOR_STYLES.replaceAll(":host", ".workbench-preview")}</style>
    <header className="workbench-header"><p className="workbench-eyebrow">Nudge UI / development</p><h1>Inspector workbench</h1><p>The real panel, ready to inspect.</p></header>
    <div className="workbench-layout">
      <nav className="workbench-scenarios" aria-label="Inspector scenarios">
        {scenarios.map((item) => <button type="button" key={item.id} aria-current={item.id === scenarioId ? "page" : undefined} onClick={() => choose(item.id)}>{item.title}</button>)}
      </nav>
      <section className="workbench-stage" aria-label="Inspector fixture">
        <div className="workbench-caption"><div><h2>{scenario.title}</h2><p>{scenario.description}</p></div><button type="button" onClick={() => setRevision((value) => value + 1)}>Reset fixture</button></div>
        <div className="workbench-preview" key={`${scenario.id}-${revision}`}><FixturePanel scenario={scenario} /></div>
      </section>
      <aside className="workbench-help"><h2>Edit the inspector</h2><p>Use Nudge to select controls in this preview and adjust their styles. Copy the resulting prompt to implement changes in the shared inspector source.</p><p>Use Nudge’s app interaction mode to operate the preview controls and switch scenarios.</p><a href="?nudge-ui=off">Open without Nudge</a></aside>
    </div>
    <ComponentExamples />
    <FixtureTargets />
  </main>;
}
