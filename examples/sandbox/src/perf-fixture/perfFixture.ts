export interface PerfNode {
  id: number;
  depth: number;
  children: PerfNode[];
}

const NODE_COUNT = 600;
const MAX_DEPTH = 12;

export const BG_CLASSES = 2000;
export const FG_CLASSES = 2000;
export const PAD_CLASSES = 1000;
export const FONT_CLASSES = 500;
export const BORDER_CLASSES = 500;

function depthFor(id: number): number {
  return id === 0 ? 0 : (id % MAX_DEPTH) + 1;
}

function parentFor(id: number): number {
  for (let j = id - 1; j >= 0; j -= 1) {
    if (depthFor(j) === depthFor(id) - 1) return j;
  }
  return 0;
}

function buildTree(): PerfNode[] {
  const nodes: PerfNode[] = [];
  for (let id = 0; id < NODE_COUNT; id += 1) {
    nodes.push({ id, depth: depthFor(id), children: [] });
  }
  for (let id = 1; id < NODE_COUNT; id += 1) {
    nodes[parentFor(id)]!.children.push(nodes[id]!);
  }
  return nodes;
}

export const NODES: PerfNode[] = buildTree();
export const ROOT: PerfNode = NODES[0]!;
export const LEAF_IDS: number[] = NODES.filter((node) => node.children.length === 0).map((node) => node.id);

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number): string => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function bgColor(index: number): string {
  return hslToHex(index * 137.508, 0.55, 0.45);
}

export function fgColor(index: number): string {
  return hslToHex(index * 137.508 + 40, 0.5, 0.62);
}

export function padValue(index: number): number {
  return 2 + (index % 40);
}

export function fontSizeValue(index: number): number {
  return 10 + (index % 30);
}

export const BORDER_COLOR = "#c9c9c9";

export function classesFor(id: number): string {
  return [
    `pf-bg-${id % BG_CLASSES}`,
    `pf-fg-${id % FG_CLASSES}`,
    `pf-pad-${id % PAD_CLASSES}`,
    `pf-font-${id % FONT_CLASSES}`,
    `pf-border-${id % BORDER_CLASSES}`,
  ].join(" ");
}

export function expectedStyleFor(id: number): {
  backgroundColor: string;
  color: string;
  paddingTop: string;
  fontSize: string;
  lineHeight: string;
  borderTopWidth: string;
  borderColor: string;
} {
  return {
    backgroundColor: bgColor(id % BG_CLASSES),
    color: fgColor(id % FG_CLASSES),
    paddingTop: `${padValue(id % PAD_CLASSES)}px`,
    fontSize: `${fontSizeValue(id % FONT_CLASSES)}px`,
    lineHeight: "1.3",
    borderTopWidth: "1px",
    borderColor: BORDER_COLOR,
  };
}

export interface CssChunk {
  id: string;
  css: string;
}

function bgRules(): string[] {
  const rules: string[] = [];
  for (let i = 0; i < BG_CLASSES; i += 1) {
    rules.push(`.pf-bg-${i}{background-color:${bgColor(i)}}`);
    if (i % 4 === 0) {
      rules.push(`.pf-bg-${i}:hover{background-color:${hslToHex(i * 137.508, 0.55, 0.32)}}`);
    }
  }
  return rules;
}

function fgRules(): string[] {
  const rules: string[] = [];
  for (let i = 0; i < FG_CLASSES; i += 1) {
    rules.push(`.pf-fg-${i}{color:${fgColor(i)}}`);
    if (i % 5 === 0) {
      rules.push(`.pf-fg-${i}:focus{color:${hslToHex(i * 137.508 + 40, 0.5, 0.8)}}`);
    }
  }
  return rules;
}

function padRules(): string[] {
  const rules: string[] = [];
  for (let i = 0; i < PAD_CLASSES; i += 1) {
    rules.push(`.pf-pad-${i}{padding:${padValue(i)}px}`);
  }
  return rules;
}

function fontRules(): string[] {
  const rules: string[] = [];
  for (let i = 0; i < FONT_CLASSES; i += 1) {
    rules.push(`.pf-font-${i}{font-size:${fontSizeValue(i)}px;line-height:1.3}`);
  }
  return rules;
}

function borderRules(): string[] {
  const rules: string[] = [];
  for (let i = 0; i < BORDER_CLASSES; i += 1) {
    rules.push(`.pf-border-${i}{border:1px solid ${BORDER_COLOR}}`);
  }
  return rules;
}

function contextRules(prefix: string, offset: number, count: number): string {
  const inner: string[] = [];
  for (let i = 0; i < count; i += 1) {
    inner.push(`.pf-${prefix}-${i}{margin-top:${2 + ((i + offset) % 24)}px;color:${fgColor(i + offset)}}`);
  }
  return inner.join("\n");
}

const MEDIA_CHUNKS = [
  `@media (min-width: 640px){\n${contextRules("media-sm", 0, 200)}\n}`,
  `@media (min-width: 1024px){\n${contextRules("media-lg", 40, 200)}\n}`,
  `@media (prefers-color-scheme: dark){\n${contextRules("media-dark", 80, 200)}\n}`,
  `@container (min-width: 400px){\n${contextRules("container", 120, 200)}\n}`,
];

function chunk(id: string, rules: string[]): CssChunk {
  return { id, css: rules.join("\n") };
}

export const CSS_CHUNKS: CssChunk[] = [
  chunk("perf-bg", bgRules()),
  chunk("perf-fg", fgRules()),
  chunk("perf-layout", [...padRules(), ...fontRules(), ...borderRules()]),
  { id: "perf-context", css: MEDIA_CHUNKS.join("\n\n") },
];

export function cssRuleCount(): number {
  return CSS_CHUNKS.reduce((total, chunk) => total + chunk.css.split("\n").filter((line) => line.trim() !== "").length, 0);
}
