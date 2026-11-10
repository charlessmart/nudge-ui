// Paints the two layers that sit under the live hero DOM: a design layer
// (rulers, element outlines, padding) and a code layer (the hero's own
// DOM serialised back into JSX). Both read the live DOM so they stay aligned
// with whatever the page actually rendered.

// The inspector's --accent (#0086e6, packages/nudge-ui/src/inspector/ui/Foundation.css), so the reveal reads as Nudge.
const ACCENT = "0, 134, 230";
const MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", Consolas, monospace';
const SANS = '"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif';

const SKIP_SUBTREE = ".landing-hero-demo-board-layer--wireframe, .landing-hero-depth";
const SVG_CHILD = new Set(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "g"]);

export type LayerFrame = {
  /** The canvas's page box; every element rect is drawn relative to it. */
  origin: DOMRect;
  width: number;
  height: number;
  dpr: number;
};

function createLayerCanvas(frame: LayerFrame): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(frame.width * frame.dpr);
  canvas.height = Math.round(frame.height * frame.dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.scale(frame.dpr, frame.dpr);
  return { canvas, ctx };
}

function isSkipped(element: Element): boolean {
  if (element.closest(SKIP_SUBTREE)) return true;
  if (SVG_CHILD.has(element.tagName.toLowerCase()) && element.closest("svg") !== element) return true;
  return false;
}

function relativeRect(rect: DOMRect, origin: DOMRect): DOMRect {
  return new DOMRect(rect.left - origin.left, rect.top - origin.top, rect.width, rect.height);
}

function intersects(rect: DOMRect, frame: LayerFrame): boolean {
  return rect.width > 0.5 && rect.height > 0.5 && rect.right > 0 && rect.bottom > 0 && rect.left < frame.width && rect.top < frame.height;
}

function drawBackground(ctx: CanvasRenderingContext2D, frame: LayerFrame): void {
  ctx.fillStyle = "#f6f7f8";
  ctx.fillRect(0, 0, frame.width, frame.height);
}

function drawGuides(ctx: CanvasRenderingContext2D, root: HTMLElement, frame: LayerFrame): void {
  const column = root.querySelector(".landing-hero-content");
  if (!column) return;
  const rect = relativeRect(column.getBoundingClientRect(), frame.origin);
  ctx.save();
  ctx.strokeStyle = "rgba(255, 38, 0, 0.55)";
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const x of [rect.left, rect.right]) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, frame.height);
  }
  ctx.stroke();
  ctx.setLineDash([2, 6]);
  ctx.strokeStyle = "rgba(255, 38, 0, 0.35)";
  ctx.beginPath();
  const center = Math.round(rect.left + rect.width / 2) + 0.5;
  ctx.moveTo(center, 0);
  ctx.lineTo(center, frame.height);
  ctx.stroke();
  ctx.restore();
}

function drawRulers(ctx: CanvasRenderingContext2D, frame: LayerFrame): void {
  const thickness = 20;
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.fillRect(0, 0, frame.width, thickness);
  ctx.fillRect(0, 0, thickness, frame.height);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, thickness + 0.5);
  ctx.lineTo(frame.width, thickness + 0.5);
  ctx.moveTo(thickness + 0.5, 0);
  ctx.lineTo(thickness + 0.5, frame.height);
  ctx.stroke();

  ctx.strokeStyle = "rgba(0, 0, 0, 0.32)";
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.font = `500 9px ${MONO}`;
  ctx.textBaseline = "top";
  ctx.beginPath();
  for (let x = thickness; x < frame.width; x += 10) {
    const position = x - thickness;
    const length = position % 100 === 0 ? thickness : position % 50 === 0 ? 8 : 4;
    ctx.moveTo(x + 0.5, thickness);
    ctx.lineTo(x + 0.5, thickness - length);
    if (position % 100 === 0) ctx.fillText(String(position), x + 3, 3);
  }
  for (let y = thickness; y < frame.height; y += 10) {
    const position = y - thickness;
    const length = position % 100 === 0 ? thickness : position % 50 === 0 ? 8 : 4;
    ctx.moveTo(thickness, y + 0.5);
    ctx.lineTo(thickness - length, y + 0.5);
    if (position % 100 === 0 && position > 0) {
      ctx.save();
      ctx.translate(3, y - 3);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(String(position), 0, 0);
      ctx.restore();
    }
  }
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, thickness, thickness);
  ctx.restore();
}

const LABELLED = [".landing-hero-demo-board", "h1", ".landing-hero-intro", ".landing-install-actions", ".landing-hero-demo-panel", ".landing-hero-demo-search"];

function elementLabel(element: Element, rect: DOMRect): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const firstClass = !id && element.classList[0] ? `.${element.classList[0]}` : "";
  return `${tag}${id}${firstClass}  ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.save();
  ctx.font = `500 10px ${MONO}`;
  const width = ctx.measureText(text).width + 10;
  const top = Math.max(0, y - 18);
  ctx.fillStyle = `rgb(${ACCENT})`;
  ctx.beginPath();
  ctx.roundRect(Math.round(x), Math.round(top), Math.ceil(width), 16, 3);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, Math.round(x) + 5, Math.round(top) + 8.5);
  ctx.restore();
}

export function paintDesignLayer(root: HTMLElement, frame: LayerFrame): HTMLCanvasElement {
  const { canvas, ctx } = createLayerCanvas(frame);
  drawBackground(ctx, frame);
  drawGuides(ctx, root, frame);
  // Padding reads as a soft accent fill, the same wash as the text runs below.
  const paddingFill = `rgba(${ACCENT}, 0.1)`;
  const labels: Array<{ text: string; x: number; y: number }> = [];

  const elements = [root, ...Array.from(root.querySelectorAll("*"))];
  for (const element of elements) {
    if (isSkipped(element)) continue;
    const rect = relativeRect(element.getBoundingClientRect(), frame.origin);
    if (!intersects(rect, frame) || element === root) continue;

    const html = element as HTMLElement;
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "contents") continue;
    const scale = html.offsetWidth > 0 ? rect.width / html.offsetWidth : 1;

    const padding = {
      top: parseFloat(style.paddingTop) * scale,
      right: parseFloat(style.paddingRight) * scale,
      bottom: parseFloat(style.paddingBottom) * scale,
      left: parseFloat(style.paddingLeft) * scale,
    };
    const border = parseFloat(style.borderTopWidth) * scale || 0;
    if ((padding.top || padding.right || padding.bottom || padding.left) && rect.width > 24 && rect.height > 16) {
      const inner = new DOMRect(rect.left + border, rect.top + border, rect.width - border * 2, rect.height - border * 2);
      ctx.save();
      ctx.beginPath();
      ctx.rect(inner.left, inner.top, inner.width, inner.height);
      ctx.rect(inner.left + padding.left, inner.top + padding.top, inner.width - padding.left - padding.right, inner.height - padding.top - padding.bottom);
      ctx.fillStyle = paddingFill;
      ctx.fill("evenodd");
      ctx.restore();
    }

    const radius = Math.min(parseFloat(style.borderTopLeftRadius) * scale || 0, rect.width / 2, rect.height / 2);
    ctx.strokeStyle = `rgba(${ACCENT}, ${element.tagName === "svg" ? 0.4 : 0.62})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(Math.round(rect.left) + 0.5, Math.round(rect.top) + 0.5, Math.round(rect.width) - 1, Math.round(rect.height) - 1, radius);
    ctx.stroke();

    if (LABELLED.some((selector) => element.matches(selector))) {
      labels.push({ text: elementLabel(element, rect), x: rect.left, y: rect.top });
    }
  }

  // Text runs read as filled bars, like the inspector's text boxes.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  ctx.fillStyle = `rgba(${ACCENT}, 0.1)`;
  ctx.strokeStyle = `rgba(${ACCENT}, 0.45)`;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    const parent = node.parentElement;
    if (!parent || isSkipped(parent)) continue;
    range.selectNodeContents(node);
    for (const lineRect of Array.from(range.getClientRects())) {
      const rect = relativeRect(lineRect, frame.origin);
      if (!intersects(rect, frame)) continue;
      ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
      ctx.strokeRect(Math.round(rect.left) + 0.5, Math.round(rect.top) + 0.5, Math.round(rect.width), Math.round(rect.height));
    }
  }

  for (const label of labels) drawLabel(ctx, label.text, label.x, label.y);
  drawRulers(ctx, frame);
  return canvas;
}

// ---------------------------------------------------------------------------
// Code layer

type TokenKind = "punct" | "tag" | "component" | "attr" | "string" | "text" | "comment" | "keyword";
type Token = { text: string; kind: TokenKind };
type Line = { indent: number; tokens: Token[] };

// A white, light-mode editor theme. The code sits behind the live hero text, so
// the type stays small; the token hues are vivid so the reveal reads as real
// syntax highlighting.
const CODE_BACKGROUND = "#ffffff";
const CODE_TEXT_ALPHA = 0.95;
const TOKEN_COLORS: Record<TokenKind, string> = {
  punct: "#6b7280",
  tag: "#e11d48",
  component: "#ea580c",
  attr: "#2563eb",
  string: "#0e7490",
  text: "#334155",
  comment: "#94a3b8",
  keyword: "#7c3aed",
};

const ATTRIBUTES: Array<[string, string]> = [
  ["id", "id"],
  ["class", "className"],
  ["href", "href"],
  ["type", "type"],
  ["role", "role"],
  ["aria-label", "aria-label"],
  ["aria-labelledby", "aria-labelledby"],
  ["viewBox", "viewBox"],
];

function pascalCase(value: string): string {
  return value.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function attributeTokens(element: Element): Token[] {
  const tokens: Token[] = [];
  for (const [name, jsxName] of ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value === null || value === "") continue;
    tokens.push({ text: " ", kind: "punct" }, { text: jsxName, kind: "attr" }, { text: "=", kind: "punct" }, { text: `"${value}"`, kind: "string" });
  }
  return tokens;
}

function iconComponent(element: Element): string | null {
  const iconClass = Array.from(element.classList).find((name) => name.startsWith("tabler-icon-"));
  return iconClass ? `Icon${pascalCase(iconClass.slice("tabler-icon-".length))}` : null;
}

function directText(element: Element): string | null {
  if (element.children.length > 0) return null;
  const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return text.length > 0 ? text : null;
}

function serialise(element: Element, indent: number, lines: Line[]): void {
  if (isSkipped(element)) return;
  const tag = element.tagName.toLowerCase();

  const icon = iconComponent(element);
  if (icon) {
    lines.push({ indent, tokens: [{ text: "<", kind: "punct" }, { text: icon, kind: "component" }, { text: " size", kind: "attr" }, { text: "={", kind: "punct" }, { text: "18", kind: "keyword" }, { text: "} />", kind: "punct" }] });
    return;
  }

  const open: Token[] = [{ text: "<", kind: "punct" }, { text: tag, kind: "tag" }, ...attributeTokens(element)];
  if (tag === "svg") {
    lines.push({ indent, tokens: [...open, { text: " />", kind: "punct" }] });
    return;
  }

  const text = directText(element);
  if (text !== null || element.childNodes.length === 0) {
    lines.push({
      indent,
      tokens: [...open, { text: ">", kind: "punct" }, ...(text ? [{ text, kind: "text" as const }] : []), { text: "</", kind: "punct" }, { text: tag, kind: "tag" }, { text: ">", kind: "punct" }],
    });
    return;
  }

  lines.push({ indent, tokens: [...open, { text: ">", kind: "punct" }] });
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const value = child.textContent?.replace(/\s+/g, " ").trim();
      if (value) lines.push({ indent: indent + 1, tokens: [{ text: value, kind: "text" }] });
    } else if (child instanceof Element) {
      serialise(child, indent + 1, lines);
    }
  }
  lines.push({ indent, tokens: [{ text: "</", kind: "punct" }, { text: tag, kind: "tag" }, { text: ">", kind: "punct" }] });
}

function fileHeader(path: string, name: string): Line[] {
  return [
    { indent: 0, tokens: [{ text: `// ${path}`, kind: "comment" }] },
    { indent: 0, tokens: [{ text: "export function ", kind: "keyword" }, { text: name, kind: "component" }, { text: "(): ", kind: "punct" }, { text: "ReactNode", kind: "component" }, { text: " {", kind: "punct" }] },
    { indent: 1, tokens: [{ text: "return", kind: "keyword" }, { text: " (", kind: "punct" }] },
  ];
}

function fileFooter(): Line[] {
  return [
    { indent: 1, tokens: [{ text: ");", kind: "punct" }] },
    { indent: 0, tokens: [{ text: "}", kind: "punct" }] },
    { indent: 0, tokens: [] },
  ];
}

const LINE_HEIGHT = 19;
const FONT_SIZE = 12;
const INDENT = 16;
const GUTTER = 34;

function drawColumn(ctx: CanvasRenderingContext2D, lines: Line[], x: number, width: number, startY: number, frame: LayerFrame): void {
  if (lines.length === 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, 0, width, frame.height);
  ctx.clip();
  ctx.font = `400 ${FONT_SIZE}px ${MONO}`;
  ctx.textBaseline = "middle";
  ctx.globalAlpha = CODE_TEXT_ALPHA;

  // Wrap the listing around so the column is always full, aligned so line
  // zero sits at startY.
  const firstRow = Math.floor(-startY / LINE_HEIGHT) - 1;
  const lastRow = Math.ceil((frame.height - startY) / LINE_HEIGHT) + 1;
  for (let row = firstRow; row <= lastRow; row++) {
    const index = ((row % lines.length) + lines.length) % lines.length;
    const line = lines[index];
    if (!line) continue;
    const y = startY + row * LINE_HEIGHT + LINE_HEIGHT / 2;
    ctx.fillStyle = "#c4c8cc";
    ctx.textAlign = "right";
    ctx.fillText(String(index + 1), x + GUTTER - 10, y);
    ctx.textAlign = "left";
    let cursor = x + GUTTER + line.indent * INDENT;
    for (const token of line.tokens) {
      ctx.fillStyle = TOKEN_COLORS[token.kind];
      ctx.fillText(token.text, cursor, y);
      cursor += ctx.measureText(token.text).width;
      if (cursor > x + width) break;
    }
  }
  ctx.restore();
}

export function paintCodeLayer(root: HTMLElement, frame: LayerFrame): HTMLCanvasElement {
  const { canvas, ctx } = createLayerCanvas(frame);
  ctx.fillStyle = CODE_BACKGROUND;
  ctx.fillRect(0, 0, frame.width, frame.height);

  // Centre column: the hero section itself, with the demo grid collapsed to
  // its component so the heading's JSX sits under the heading.
  const content = root.querySelector(".landing-hero-content");
  const centreLines: Line[] = [...fileHeader("src/App.tsx", "Hero")];
  centreLines.push({ indent: 2, tokens: [{ text: "<", kind: "punct" }, { text: "section", kind: "tag" }, ...attributeTokens(root), { text: ">", kind: "punct" }] });
  centreLines.push({ indent: 3, tokens: [{ text: "<", kind: "punct" }, { text: "HeroDemoGrid", kind: "component" }, { text: " />", kind: "punct" }] });
  const contentStart = centreLines.length;
  if (content) serialise(content, 3, centreLines);
  centreLines.push({ indent: 2, tokens: [{ text: "</", kind: "punct" }, { text: "section", kind: "tag" }, { text: ">", kind: "punct" }] });
  centreLines.push(...fileFooter());

  const cardLines: Line[] = [];
  for (const card of Array.from(root.querySelectorAll(".landing-hero-demo-board-layer--full > *"))) {
    const name = pascalCase(card.getAttribute("aria-label")?.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, "-") ?? "Card");
    cardLines.push(...fileHeader("src/components/HeroDemoGrid.tsx", name));
    serialise(card, 2, cardLines);
    cardLines.push(...fileFooter());
  }
  // With the demo cards switched off, the side columns show the hero section
  // itself so the code layer is never blank.
  if (cardLines.length === 0) {
    cardLines.push(...fileHeader("src/App.tsx", "Hero"));
    serialise(root, 2, cardLines);
    cardLines.push(...fileFooter());
  }

  const contentRect = content ? relativeRect(content.getBoundingClientRect(), frame.origin) : new DOMRect(frame.width / 2 - 340, frame.height / 3, 680, 200);
  const centreWidth = Math.max(560, contentRect.width + 120);
  const centreX = contentRect.left + contentRect.width / 2 - centreWidth / 2;
  const heading = root.querySelector("h1");
  const anchorY = heading ? relativeRect(heading.getBoundingClientRect(), frame.origin).top : contentRect.top;
  // Line `contentStart` opens the content div; the h1 follows on the next line.
  drawColumn(ctx, centreLines, centreX, centreWidth, anchorY - (contentStart + 1) * LINE_HEIGHT, frame);

  const sideWidth = 460;
  const gap = 24;
  let offset = 0;
  for (let x = centreX + centreWidth + gap; x < frame.width; x += sideWidth + gap) {
    drawColumn(ctx, cardLines, x, sideWidth, 40 - offset * LINE_HEIGHT, frame);
    offset += 23;
  }
  for (let x = centreX - gap - sideWidth; x + sideWidth > 0; x -= sideWidth + gap) {
    drawColumn(ctx, cardLines, x, sideWidth, 40 - offset * LINE_HEIGHT, frame);
    offset += 23;
  }

  // Divider rules between the columns.
  ctx.strokeStyle = "rgba(0, 0, 0, 0.06)";
  ctx.beginPath();
  ctx.moveTo(Math.round(centreX - gap / 2) + 0.5, 0);
  ctx.lineTo(Math.round(centreX - gap / 2) + 0.5, frame.height);
  ctx.moveTo(Math.round(centreX + centreWidth + gap / 2) + 0.5, 0);
  ctx.lineTo(Math.round(centreX + centreWidth + gap / 2) + 0.5, frame.height);
  ctx.stroke();
  return canvas;
}
