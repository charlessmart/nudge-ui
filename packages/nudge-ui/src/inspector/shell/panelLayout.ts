const LAYOUT_STYLE_ID = "nudge-ui-panel-layout";
const PANEL_LAYOUT_ATTRIBUTE = "data-nudge-ui-panel";

const LAYOUT_STYLES = `
html[${PANEL_LAYOUT_ATTRIBUTE}="open"] body {
  margin-right: min(320px, 100vw);
  transition: margin-right 180ms ease;
}
`;

function ensureLayoutStyles(): void {
  if (document.documentElement.hasAttribute("data-nudge-ui-editor")) return;
  if (document.getElementById(LAYOUT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = LAYOUT_STYLE_ID;
  style.textContent = LAYOUT_STYLES;
  document.head.appendChild(style);
}

export function setInspectorLayoutOpen(open: boolean): void {
  const root = document.documentElement;
  if (open) {
    ensureLayoutStyles();
    root.setAttribute(PANEL_LAYOUT_ATTRIBUTE, "open");
    return;
  }
  root.removeAttribute(PANEL_LAYOUT_ATTRIBUTE);
}

export function clearInspectorLayout(): void {
  document.documentElement.removeAttribute(PANEL_LAYOUT_ATTRIBUTE);
  document.getElementById(LAYOUT_STYLE_ID)?.remove();
}
