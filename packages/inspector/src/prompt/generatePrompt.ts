import type { ChangeRecord } from "../changesLog.ts";
import type { TokenEntry } from "virtual:design-tokens";

export interface FrameworkHints {
  framework?: string;
  stylingSystem?: string;
}

const EMPTY_SENTINEL =
  "<!-- No changes to export -->\n\nThe changes log is empty. Make a change in the Design Tool inspector first.";

interface Group {
  key: string;
  cid: string;
  file: string;
  line: number;
  selector: string;
  changes: ChangeRecord[];
}

function basename(filePath: string): string {
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return slash >= 0 ? filePath.slice(slash + 1) : filePath;
}

function groupChanges(changes: ChangeRecord[]): Group[] {
  const map = new Map<string, Group>();
  for (const change of changes) {
    const key = [change.cid, change.file, change.line, change.selector, change.scope ?? "source-site"].join("\u0000");
    let group = map.get(key);
    if (!group) {
      const first = change;
      group = {
        key,
        cid: change.cid,
        file: change.file,
        line: first.source.line || first.line,
        selector: first.selector,
        changes: [],
      };
      map.set(key, group);
    }
    group.changes.push(change);
  }
  return Array.from(map.values());
}

function changeLine(rec: ChangeRecord): string {
  const prop = rec.property;
  const newToken = rec.newToken;
  const oldToken = rec.oldToken;
  const oldRaw = rec.oldRawValue;

  if (newToken && oldToken) {
    return `- \`${prop}\`: \`${oldToken.name}\` → \`${newToken.name}\`${conflictSuffix(rec)}`;
  }

  if (newToken && !oldToken) {
    const before = oldRaw !== undefined ? `\`${oldRaw}\` → ` : "";
    return `- \`${prop}\`: ${before}\`var(${newToken.name})\` (promoted from raw value — consider adding a dedicated token)${conflictSuffix(rec)}`;
  }

  if (!newToken && rec.rawValue !== undefined) {
    const before = oldRaw !== undefined ? `\`${oldRaw}\` → ` : "";
    return `- \`${prop}\`: ${before}\`${rec.rawValue}\` (not a token — consider adding one)${conflictSuffix(rec)}`;
  }

  return `- \`${prop}\`: (no value)`;
}

function conflictSuffix(rec: ChangeRecord): string {
  const result = rec.previewResult;
  if (!result || result.status === "applied") return "";
  return ` — preview conflict: browser computed \`${result.computedValue || "(no value)"}\` (${result.reason ?? "cascade conflict"}); implement the requested value without assuming \`!important\``;
}

function deduplicateChanges(changes: ChangeRecord[]): ChangeRecord[] {
  const groups = new Map<string, ChangeRecord[]>();
  for (const change of changes) {
    const key = [change.cid, change.file, change.line, change.selector, change.scope ?? "source-site", change.property].join("\u0000");
    const list = groups.get(key);
    if (list) {
      list.push(change);
    } else {
      groups.set(key, [change]);
    }
  }

  const result: ChangeRecord[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      result.push(list[0]!);
    } else {
      const first = list[0]!;
      const last = list[list.length - 1]!;
      result.push({
        ...last,
        oldToken: first.oldToken,
        oldRawValue: first.oldRawValue,
      });
    }
  }
  return result;
}

export function generatePrompt(changes: ChangeRecord[], frameworkHints?: FrameworkHints): string {
  if (changes.length === 0) return EMPTY_SENTINEL;

  const deduplicated = deduplicateChanges(changes);
  if (deduplicated.length === 0) return EMPTY_SENTINEL;

  const groups = groupChanges(deduplicated);
  const first = groups[0]!;
  const headerFile = basename(first.file);
  const framework = frameworkHints?.framework ?? "React";
  const stylingSystem = frameworkHints?.stylingSystem ?? "CSS custom properties";

  const lines: string[] = [];
  lines.push(`# Design changes for ${headerFile}`);
  lines.push("");
  lines.push(`Framework: ${framework} + ${stylingSystem}`);
  lines.push("");
  lines.push("## Changes");
  lines.push("");

  for (const group of groups) {
    lines.push(`### ${group.cid} (${group.file}:${group.line})`);
    for (const change of group.changes) {
      lines.push(changeLine(change));
      if (change.scope === "instance-preview" && change.instanceEvidence) {
        const evidence = change.instanceEvidence;
        lines.push(`  - Scope: one rendered instance (index ${evidence.renderedIndex}); implement a data-driven conditional at the source site.`);
        if (evidence.props) lines.push(`  - Props evidence: \`${evidence.props}\``);
        if (evidence.text) lines.push(`  - Text evidence: \`${evidence.text}\``);
      }
    }
    lines.push("");
  }

  lines.push("## Selectors (fallback)");
  for (const group of groups) {
    lines.push(`- \`${group.selector}\``);
  }

  return lines.join("\n");
}
