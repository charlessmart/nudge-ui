import activityStyles from "./AgentActivityOverlay.css?inline";
import { useEffect, useState } from "react";
import { BorderBeam } from "border-beam";
import { useAgentActivity, type ActivityFile } from "../agent/activity.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { parseDataSrc } from "../selection/resolveSelection.ts";
import { contentEditTarget, type FrameContent } from "./frameContent.ts";

export interface ActivityAttribution { files: readonly ActivityFile[]; elements: readonly Element[] }

/** Reuses rendered source identities. Study provenance cannot target application source. */
export function attributeActivity(content: FrameContent, document: Document, files: readonly ActivityFile[]): ActivityAttribution {
  const target = contentEditTarget(content);
  if (target.kind === "html") return { files: files.filter((file) => file.file === target.path), elements: [] };
  const matched = new Set<ActivityFile>();
  const elements: Element[] = [];
  for (const element of document.querySelectorAll("[data-src]")) {
    const source = parseDataSrc(element.getAttribute("data-src") ?? "");
    if (!source) continue;
    for (const file of files) {
      if (source.file.replace(/^\.\//, "") !== file.file) continue;
      matched.add(file);
      if (file.operation !== "edit" || (file.componentId && file.componentId !== element.getAttribute("data-cid"))) continue;
      if (file.line !== undefined && (source.line < file.line || source.line > (file.endLine ?? file.line))) continue;
      elements.push(element);
    }
  }
  // Highlight outer matches once when one component contains matching descendants.
  return { files: [...matched], elements: [...new Set(elements)].filter((element, _index, all) => !all.some((parent) => parent !== element && parent.contains(element))) };
}
interface Highlight { x: number; y: number; width: number; height: number }

export function AgentActivityOverlay({ cardId, content, iframe }: { cardId: string; content: FrameContent; iframe: HTMLIFrameElement | null }) {
  const activity = useAgentActivity(getNudgeUiRuntimeConfig().projectId);
  const [visual, setVisual] = useState<{ files: readonly ActivityFile[]; highlights: Highlight[] }>({ files: [], highlights: [] });
  useEffect(() => {
    if (!activity.requestId || !iframe || !activity.files.length) { setVisual({ files: [], highlights: [] }); return; }
    let detachDocument = () => {};
    const attachDocument = () => {
      detachDocument();
      let document: Document | null = null;
      try { document = iframe.contentDocument; } catch { document = null; }
      if (!document?.defaultView) { setVisual({ files: [], highlights: [] }); return; }
      const view = document.defaultView;
      const ownedDocument = document;
      let attribution = attributeActivity(content, ownedDocument, activity.files);
      let frame: number | null = null;
      let sourceChanged = false;
      const measure = () => {
        frame = null;
        if (sourceChanged) { attribution = attributeActivity(content, ownedDocument, activity.files); sourceChanged = false; }
        const highlights = attribution.elements.slice(0, 64).map((element) => {
          const rect = element.getBoundingClientRect();
          return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
        }).filter((rect) => rect.width > 0 && rect.height > 0);
        setVisual((previous) => {
          const sameFiles = previous.files.length === attribution.files.length && previous.files.every((file, index) => file === attribution.files[index]);
          const sameRects = previous.highlights.length === highlights.length && previous.highlights.every((rect, index) => { const next = highlights[index]!; return rect.x === next.x && rect.y === next.y && rect.width === next.width && rect.height === next.height; });
          return sameFiles && sameRects ? previous : { files: attribution.files, highlights };
        });
      };
      const schedule = () => { if (frame === null) frame = view.requestAnimationFrame(measure); };
      const mutations = new MutationObserver((records) => {
        sourceChanged ||= records.some((record) => record.type === "childList" || record.attributeName === "data-src" || record.attributeName === "data-cid");
        schedule();
      });
      mutations.observe(ownedDocument.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-src", "data-cid", "class", "style"] });
      const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
      resize?.observe(ownedDocument.documentElement);
      for (const element of attribution.elements.slice(0, 64)) resize?.observe(element);
      view.addEventListener("scroll", schedule, true);
      view.addEventListener("resize", schedule);
      measure();
      detachDocument = () => {
        mutations.disconnect(); resize?.disconnect();
        view.removeEventListener("scroll", schedule, true); view.removeEventListener("resize", schedule);
        if (frame !== null) view.cancelAnimationFrame(frame);
      };
    };
    attachDocument();
    iframe.addEventListener("load", attachDocument);
    return () => { iframe.removeEventListener("load", attachDocument); detachDocument(); };
  }, [activity, content, iframe]);
  const submitted = activity.requestId !== null && activity.targets.includes(cardId);
  const working = activity.requestId !== null && (submitted || visual.files.length > 0);
  if (!working) return null;
  const latest = visual.files.at(-1) ?? (submitted ? activity.files.at(-1) : undefined);
  const label = latest ? `${latest.operation === "edit" ? "Editing" : "Reading"} ${latest.file}` : "Agent working…";
  return <div className="canvas-agent-activity" data-test={`canvas-agent-activity-${cardId}`}>
    <BorderBeam size="md" colorVariant="ocean" strength={latest?.operation === "read" ? 0.45 : 0.85} borderRadius={4} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}><div style={{ width: "100%", height: "100%" }} /></BorderBeam>
    {visual.highlights.map((rect, index) => <div key={index} className="canvas-agent-activity__shimmer" data-test="canvas-agent-component-shimmer" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} />)}
    <span className="canvas-agent-activity__label" role="status">{label}</span>
    <style>{activityStyles}</style>
  </div>;
}
