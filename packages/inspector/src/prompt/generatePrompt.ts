import { isTokenChange } from "../changesLog.ts";
import type { ChangeRecord, ElementChangeRecord, TokenChangeRecord } from "../changesLog.ts";

export interface FrameworkHints {
  framework?: string;
  stylingSystem?: string;
}

const EMPTY_SENTINEL =
  "<!-- No changes to export -->\n\nThe changes log is empty. Make a change in the Design Tool inspector first.";

interface ElementGroup {
  key: string;
  cid: string;
  file: string;
  line: number;
  selector: string;
  changes: ElementChangeRecord[];
}

function basename(filePath: string): string {
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return slash >= 0 ? filePath.slice(slash + 1) : filePath;
}

function recordKey(change: ChangeRecord): string {
  if (isTokenChange(change)) {
    return ["token", change.tokenName, change.file, change.line, change.selector, JSON.stringify(change.context)].join("\u0000");
  }
  return [change.cid, change.file, change.line, change.selector, change.scope ?? "source-site", change.state ?? "base", change.property].join("\u0000");
}

function deduplicateChanges(changes: ChangeRecord[]): ChangeRecord[] {
  const groups = new Map<string, ChangeRecord[]>();
  for (const change of changes) {
    const list = groups.get(recordKey(change));
    if (list) list.push(change);
    else groups.set(recordKey(change), [change]);
  }

  return [...groups.values()].map((list) => {
    const first = list[0]!;
    const last = list.at(-1)!;
    if (isTokenChange(first) && isTokenChange(last)) {
      return { ...last, oldRawValue: first.oldRawValue };
    }
    if (!isTokenChange(first) && !isTokenChange(last)) {
      return { ...last, oldToken: first.oldToken, oldRawValue: first.oldRawValue };
    }
    return last;
  });
}

function groupElementChanges(changes: ElementChangeRecord[]): ElementGroup[] {
  const map = new Map<string, ElementGroup>();
  for (const change of changes) {
    const key = [change.cid, change.file, change.line, change.selector, change.scope ?? "source-site", change.state ?? "base"].join("\u0000");
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        cid: change.cid,
        file: change.file,
        line: change.source.line || change.line,
        selector: change.selector,
        changes: [],
      };
      map.set(key, group);
    }
    group.changes.push(change);
  }
  return [...map.values()];
}

function conflictSuffix(rec: ChangeRecord): string {
  const result = rec.previewResult;
  if (!result || result.status === "applied") return "";
  return ` — preview conflict: browser computed \`${result.computedValue || "(no value)"}\` (${result.reason ?? "cascade conflict"}); implement the requested value without assuming \`!important\``;
}

function elementChangeLine(rec: ElementChangeRecord): string {
  if (rec.newToken && rec.oldToken) {
    return `- \`${rec.property}\`: \`${rec.oldToken.name}\` → \`${rec.newToken.name}\`${conflictSuffix(rec)}`;
  }
  if (rec.newToken) {
    const before = rec.oldRawValue !== undefined ? `\`${rec.oldRawValue}\` → ` : "";
    return `- \`${rec.property}\`: ${before}\`var(${rec.newToken.name})\` (promoted from raw value — consider adding a dedicated token)${conflictSuffix(rec)}`;
  }
  if (rec.rawValue !== undefined) {
    const before = rec.oldRawValue !== undefined ? `\`${rec.oldRawValue}\` → ` : "";
    return `- \`${rec.property}\`: ${before}\`${rec.rawValue}\` (not a token — consider adding one)${conflictSuffix(rec)}`;
  }
  return `- \`${rec.property}\`: (no value)`;
}

function tokenChangeLine(rec: TokenChangeRecord): string {
  return `- \`${rec.tokenName}\` (${rec.contextLabel}, ${rec.file}:${rec.line}): \`${rec.oldRawValue}\` → \`${rec.rawValue}\`${conflictSuffix(rec)}`;
}

export function generatePrompt(changes: ChangeRecord[], frameworkHints?: FrameworkHints): string {
  if (changes.length === 0) return EMPTY_SENTINEL;
  const deduplicated = deduplicateChanges(changes);
  if (deduplicated.length === 0) return EMPTY_SENTINEL;

  const tokenChanges = deduplicated.filter(isTokenChange);
  const elementChanges = deduplicated.filter((change): change is ElementChangeRecord => !isTokenChange(change));
  const elementGroups = groupElementChanges(elementChanges);
  const firstFile = deduplicated[0]!.file;
  const framework = frameworkHints?.framework ?? "React";
  const stylingSystem = frameworkHints?.stylingSystem ?? "CSS custom properties";
  const lines = [
    `# Design changes for ${basename(firstFile)}`,
    "",
    `Framework: ${framework} + ${stylingSystem}`,
    "",
  ];

  if (tokenChanges.length > 0) {
    lines.push("## Global token changes", "");
    tokenChanges.forEach((change) => lines.push(tokenChangeLine(change)));
    lines.push("");
  }

  if (elementGroups.length > 0) {
    lines.push("## Changes", "");
    for (const group of elementGroups) {
      const state = group.changes[0]?.state ?? "base";
      lines.push(`### ${group.cid} (${group.file}:${group.line}) · ${state}`);
      for (const change of group.changes) {
        lines.push(elementChangeLine(change));
        if (change.scope === "instance-preview" && change.instanceEvidence) {
          const evidence = change.instanceEvidence;
          lines.push(`  - Scope: one rendered instance (index ${evidence.renderedIndex}); implement a data-driven conditional at the source site.`);
          if (evidence.props) lines.push(`  - Props evidence: \`${evidence.props}\``);
          if (evidence.text) lines.push(`  - Text evidence: \`${evidence.text}\``);
        }
      }
      lines.push("");
    }
  }

  lines.push("## Selectors (fallback)");
  tokenChanges.forEach((change) => lines.push(`- \`${change.tokenName}\` in \`${change.selector}\``));
  elementGroups.forEach((group) => lines.push(`- \`${group.selector}\``));
  return lines.join("\n");
}
