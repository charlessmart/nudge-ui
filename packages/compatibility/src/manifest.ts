export type CompatibilityEditCapability = "atomic" | "color" | "box-sides" | "structured" | "composite" | "raw";

export interface CompatibilityInspectionProperty {
  property: string;
  authored?: string;
  computed?: string;
  tokenName: string | null;
  tokens?: Array<{ name: string }>;
  capability?: CompatibilityEditCapability;
  confidence: "exact" | "probable" | "unknown";
}

export interface CompatibilityInspection {
  catalog: Array<{
    name: string;
    cssName: string;
    adapter?: string;
    declarations: Array<{
      value: string;
      source: string;
      context: { selector?: string };
    }>;
  }>;
  properties: CompatibilityInspectionProperty[];
  controls: Array<{
    property: string;
    kind: "token" | "raw";
    activeToken: string | null;
    suggestions: string[];
  }>;
  managedPreview: {
    rules: Array<{
      selector: string;
      declarations: Record<string, string>;
    }>;
    results: Array<{
      property: string;
      requestedValue: string;
      computedValue: string;
      status: "applied" | "conflict";
      reason?: string;
    }>;
  };
  prompt: string | null;
}

export interface CatalogExpectation {
  name: string;
  adapter?: string;
  cssNamePattern?: string;
  declaration?: {
    value: string;
    sourcePattern?: string;
    selectorPattern?: string;
  };
}

export interface PropertyExpectation {
  property: string;
  authored?: string;
  authoredPattern?: string;
  computed?: string;
  token?: string | null;
  tokens?: string[];
  capability?: CompatibilityEditCapability;
  confidence?: "exact" | "probable" | "unknown";
}

export interface ControlExpectation {
  property: string;
  kind?: "token" | "raw";
  activeToken?: string | null;
  suggestionsContain?: string[];
}

export interface EditExpectation {
  property: string;
  selectToken: string;
  computedAfter: string;
  promptContains: string[];
  revertTo: string;
}

export interface CompatibilityAction {
  kind: "call-window-hook";
  name: string;
}

export interface CompatibilityScenario {
  id: string;
  path?: string;
  selector: string;
  beforeInspect?: CompatibilityAction;
  catalog?: CatalogExpectation[];
  properties: PropertyExpectation[];
  controls?: ControlExpectation[];
  edit?: EditExpectation;
}

export type InvariantField = "authored" | "computed" | "tokenName" | "capability" | "confidence";

export interface CompatibilityInvariant {
  id: string;
  left: string;
  right: string;
  property: string;
  equal: InvariantField[];
  equalSuggestions?: boolean;
}

export interface CompatibilityManifest {
  name: string;
  scenarios: CompatibilityScenario[];
  invariants?: CompatibilityInvariant[];
}

export function validateCompatibilityManifest(manifest: CompatibilityManifest): string[] {
  const failures: string[] = [];
  const scenarioIds = new Set<string>();
  for (const scenario of manifest.scenarios) {
    if (scenarioIds.has(scenario.id)) failures.push(`duplicate scenario id: ${scenario.id}`);
    scenarioIds.add(scenario.id);
    if (!scenario.selector.trim()) failures.push(`${scenario.id}: selector is empty`);
    if (scenario.properties.length === 0) failures.push(`${scenario.id}: no property expectations`);
  }
  for (const invariant of manifest.invariants ?? []) {
    if (!scenarioIds.has(invariant.left)) failures.push(`${invariant.id}: unknown left scenario ${invariant.left}`);
    if (!scenarioIds.has(invariant.right)) failures.push(`${invariant.id}: unknown right scenario ${invariant.right}`);
    if (invariant.equal.length === 0 && !invariant.equalSuggestions) failures.push(`${invariant.id}: invariant compares nothing`);
  }
  return failures;
}
