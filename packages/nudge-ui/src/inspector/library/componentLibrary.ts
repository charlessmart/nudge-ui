import type { ComponentContract } from "../componentSemantics/types.ts";
import { sheetVariantCount } from "../../componentSheet/model.ts";

export interface LibraryComponent {
  readonly componentId: string;
  readonly name: string;
  readonly source: string;
  readonly variantCount: number;
  /** Hidden by detection or by the user, so listed in the Hidden folder instead of its own. */
  readonly hidden: boolean;
}

export interface LibraryGroup {
  readonly id: string;
  readonly label: string;
  /** Project folders come first, then route pages and layouts, then third-party components the project renders. */
  readonly kind: LibraryGroupKind;
  readonly components: readonly LibraryComponent[];
}

export type LibraryGroupKind = "project" | "page" | "package";

/** The user's own calls, which outrank every guess about what renders UI. Keys are component ids. */
export interface LibraryVisibility {
  /** Hidden with the providers and wrappers, whatever detection said. */
  readonly hidden?: readonly string[];
  /** Listed normally, even when detection took the component for a wrapper. */
  readonly shown?: readonly string[];
}

export interface LibraryOptions {
  readonly query?: string;
  /** Providers, guards and other components that render no UI of their own are left out unless asked for. */
  readonly includeWrappers?: boolean;
  readonly visibility?: LibraryVisibility;
}

const KIND_ORDER: Record<LibraryGroupKind, number> = { project: 0, page: 1, package: 2 };

/** Groups project components by folder, then package components by module, each sorted by name. */
export function groupLibraryComponents(contracts: readonly ComponentContract[], options: LibraryOptions = {}): LibraryGroup[] {
  const needle = (options.query ?? "").trim().toLowerCase();
  const groups = new Map<string, { kind: LibraryGroupKind; label: string; components: LibraryComponent[] }>();
  const seen = new Set<string>();
  for (const contract of libraryContracts(contracts)) {
    if (seen.has(contract.componentId)) continue;
    seen.add(contract.componentId);
    const hidden = isHidden(contract, options.visibility);
    if (hidden && !options.includeWrappers) continue;
    if (needle && !contract.name.toLowerCase().includes(needle)) continue;
    const kind = groupKind(contract);
    const label = groupLabel(contract);
    const key = `${kind}:${label}`;
    const variantCount = sheetVariantCount(contract);
    const entry = { componentId: contract.componentId, name: contract.name, source: contract.file, variantCount, hidden };
    const group = groups.get(key) ?? { kind, label, components: [] };
    group.components.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ kind, label, components }) => ({
      id: label,
      label,
      kind,
      components: [...components].sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => KIND_ORDER[left.kind] - KIND_ORDER[right.kind] || left.label.localeCompare(right.label));
}

/** Wrappers and components the user hid, by name, for the panel's Hidden folder. */
export function hiddenLibraryComponents(contracts: readonly ComponentContract[], visibility?: LibraryVisibility): LibraryComponent[] {
  return groupLibraryComponents(contracts, { includeWrappers: true, visibility })
    .flatMap((group) => group.components.filter((component) => component.hidden))
    .sort((left, right) => left.name.localeCompare(right.name));
}

// A package manifest lists names and props with no types to inspect, so its wrappers are known by name alone.
// Contracts read from a package's declarations carry a structural role instead.
const MANIFEST_WRAPPER_NAME = /(?:Provider|Context|Portal|Boundary)$/;

/** Whether detection took the component for something that renders no UI of its own. */
export function isWrapper(contract: ComponentContract): boolean {
  return contract.role === "wrapper"
    || (contract.provenance === "package-manifest" && MANIFEST_WRAPPER_NAME.test(contract.name));
}

/** Detection decides until the user has said otherwise. */
export function isHidden(contract: ComponentContract, visibility?: LibraryVisibility): boolean {
  if (visibility?.hidden?.includes(contract.componentId)) return true;
  if (visibility?.shown?.includes(contract.componentId)) return false;
  return isWrapper(contract);
}

function libraryContracts(contracts: readonly ComponentContract[]): ComponentContract[] {
  return contracts.filter((contract) => !FRAMEWORK_MODULES.has(contract.file));
}

// Framework primitives such as Suspense have contracts but are not part of a design system.
const FRAMEWORK_MODULES = new Set(["react", "react-dom"]);
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/;
// Next's app router names route files by role; `pages/` and `routes/` folders are file-based routers (Next pages,
// Remix, React Router, TanStack Router). These are screens composed from components rather than components.
const APP_ROUTE_FILE = /(?:^|\/)app\/(?:.*\/)?(?:page|layout|template|loading|error|global-error|not-found|default)\.[cm]?[jt]sx?$/;
const ROUTER_FOLDER = /(?:^|\/)(?:pages|routes)\//;

function groupKind(contract: ComponentContract): LibraryGroupKind {
  if (!SOURCE_FILE.test(contract.file)) return "package";
  return APP_ROUTE_FILE.test(contract.file) || ROUTER_FOLDER.test(contract.file) ? "page" : "project";
}

function groupLabel(contract: ComponentContract): string {
  if (!SOURCE_FILE.test(contract.file)) return contract.file;
  const folder = contract.file.split("/").slice(0, -1).join("/");
  return folder || "Project";
}

export interface LibraryFolder {
  readonly id: string;
  readonly label: string;
  /** Components in this folder and every folder below it. */
  readonly count: number;
  readonly folders: readonly LibraryFolder[];
  readonly components: readonly LibraryComponent[];
}

interface MutableFolder {
  id: string;
  label: string;
  folders: Map<string, MutableFolder>;
  components: LibraryComponent[];
}

function finishFolder(folder: MutableFolder): LibraryFolder {
  let folders = [...folder.folders.values()].map(finishFolder);
  const components = [...folder.components];
  // A folder holding only its own component (Button/Button.tsx) reads better as the component itself.
  folders = folders.filter((child) => {
    if (child.folders.length > 0 || child.components.length !== 1) return true;
    components.push(child.components[0]!);
    return false;
  });
  // `app` → `components` → `ui` with nothing in between becomes one `app/components/ui` row.
  if (components.length === 0 && folders.length === 1) {
    const [only] = folders;
    return { ...only!, label: `${folder.label}/${only!.label}` };
  }
  folders.sort((left, right) => left.label.localeCompare(right.label));
  components.sort((left, right) => left.name.localeCompare(right.name));
  const count = components.length + folders.reduce((total, child) => total + child.count, 0);
  return { id: folder.id, label: folder.label, count, folders, components };
}

/**
 * Project (or page) groups as a folder tree with single-child chains and single-component folders collapsed. Page
 * folder ids are prefixed with `page:` so they toggle independently of a project folder at the same path.
 */
export function buildProjectTree(groups: readonly LibraryGroup[], kind: "project" | "page" = "project"): LibraryFolder[] {
  const idPrefix = kind === "page" ? "page:" : "";
  const root: MutableFolder = { id: idPrefix, label: "", folders: new Map(), components: [] };
  for (const group of groups) {
    if (group.kind !== kind) continue;
    let folder = root;
    for (const segment of group.label === "Project" ? [] : group.label.split("/")) {
      let child = folder.folders.get(segment);
      if (!child) {
        child = { id: folder.id === idPrefix ? `${idPrefix}${segment}` : `${folder.id}/${segment}`, label: segment, folders: new Map(), components: [] };
        folder.folders.set(segment, child);
      }
      folder = child;
    }
    folder.components.push(...group.components);
  }
  const finished = finishFolder(root);
  // The root has no label, so a collapsed root chain starts with "/".
  if (finished.label.startsWith("/")) return [{ ...finished, label: finished.label.slice(1) }];
  return finished.components.length > 0
    ? [...finished.folders, { id: idPrefix, label: "Project", count: finished.components.length, folders: [], components: finished.components }]
    : [...finished.folders];
}
