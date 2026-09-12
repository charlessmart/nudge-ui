/** The subset of Babel nodes needed by the host-neutral identity transform. */
export type SyntaxNode = {
  type: string;
  [key: string]: unknown;
};

export interface ComponentInstrumentationOptions {
  /**
   * Package exports whose element type can be replaced by a semantic preview
   * wrapper. Keys are exact import specifiers; values are exported names
   * (`default` for a default import). Discovery of a prop contract does not
   * imply compatibility. Prefer `hostPolicy` when the host can resolve import
   * provenance and rendered slots.
   */
  compatibleComponentImports?: Readonly<Record<string, readonly string[]>>;
  /** Data-only import provenance and slot semantics resolved by the host Adapter. */
  hostPolicy?: import("./componentPolicyResolution.ts").HostComponentPolicy;
}

export interface ComponentBinding {
  source: string;
  exportName: string | null;
  namespace: boolean;
}

export interface ComponentInstrumentationPolicy {
  bindings: Map<string, ComponentBinding>;
  canWrap(componentName: string): boolean;
  rendersChildren(componentName: string): boolean;
  rendersProp(componentName: string, prop: string): boolean;
  componentId(componentName: string): string | null;
}

function isNode(value: unknown): value is SyntaxNode {
  return typeof value === "object" && value !== null && typeof Reflect.get(value, "type") === "string";
}

function identifier(node: unknown): string | null {
  if (!isNode(node) || (node.type !== "Identifier" && node.type !== "StringLiteral")) return null;
  return typeof node.name === "string" ? node.name : typeof node.value === "string" ? node.value : null;
}

function children(node: SyntaxNode): SyntaxNode[] {
  return Object.entries(node).flatMap(([key, value]) => {
    if (["loc", "extra", "leadingComments", "trailingComments", "innerComments"].includes(key)) return [];
    if (isNode(value)) return [value];
    return Array.isArray(value) ? value.filter(isNode) : [];
  });
}

/**
 * Classify bindings before editing JSX. Unknown and shadowed bindings are
 * deliberately excluded: losing a semantic control is safer than changing an
 * application's component protocol. Rendered DOM identity is independent.
 */
export function createComponentInstrumentationPolicy(
  ast: SyntaxNode,
  options: ComponentInstrumentationOptions,
): ComponentInstrumentationPolicy {
  const bindings = new Map<string, ComponentBinding>();
  const locals = new Set<string>();
  const seen = new Set<string>();
  const ambiguous = new Set<string>();
  const record = (name: string | null, local = false): void => {
    if (!name) return;
    if (seen.has(name)) ambiguous.add(name);
    seen.add(name);
    if (local) locals.add(name);
  };
  const recordPattern = (pattern: unknown): void => {
    if (!isNode(pattern)) return;
    if (pattern.type === "Identifier") {
      record(identifier(pattern));
    } else if (pattern.type === "RestElement") {
      recordPattern(pattern.argument);
    } else if (pattern.type === "AssignmentPattern") {
      recordPattern(pattern.left);
    } else if (pattern.type === "ObjectPattern") {
      for (const property of (pattern.properties as SyntaxNode[] | undefined) ?? []) {
        recordPattern(property.type === "RestElement" ? property.argument : property.value);
      }
    } else if (pattern.type === "ArrayPattern") {
      for (const element of (pattern.elements as unknown[] | undefined) ?? []) recordPattern(element);
    }
  };
  const program = isNode(ast.program) ? ast.program : ast;
  for (const statement of (program.body as SyntaxNode[] | undefined) ?? []) {
    if (statement.type !== "ImportDeclaration" || !isNode(statement.source)) continue;
    if (statement.importKind === "type") continue;
    const source = String(statement.source.value ?? "");
    for (const specifier of (statement.specifiers as SyntaxNode[] | undefined) ?? []) {
      if (specifier.importKind === "type") continue;
      const local = identifier(specifier.local);
      if (!local) continue;
      record(local);
      bindings.set(local, {
        source,
        exportName: specifier.type === "ImportDefaultSpecifier" ? "default" : identifier(specifier.imported),
        namespace: specifier.type === "ImportNamespaceSpecifier",
      });
    }
  }

  const imported = (name: string): { source: string; exportName: string } | null => {
    const [root, ...members] = name.split(".");
    const binding = root ? bindings.get(root) : undefined;
    if (!binding || ambiguous.has(root!)) return null;
    const exportName = binding.namespace
      ? members.join(".")
      : [binding.exportName, ...members].filter(Boolean).join(".");
    return { source: binding.source, exportName };
  };
  const isLocalDefinition = (value: unknown): boolean => {
    if (!isNode(value)) return false;
    return [
      "ArrowFunctionExpression",
      "FunctionExpression",
      "ClassExpression",
      "CallExpression",
      "TaggedTemplateExpression",
    ].includes(value.type);
  };
  const visit = (node: SyntaxNode): void => {
    if (node.type === "ImportDeclaration") return;
    if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") record(identifier(node.id), true);
    if (node.type === "VariableDeclarator") {
      if (isNode(node.id) && node.id.type === "Identifier") record(identifier(node.id), isLocalDefinition(node.init));
      else recordPattern(node.id);
    }
    if (Array.isArray(node.params)) node.params.forEach(recordPattern);
    if (node.type === "CatchClause") recordPattern(node.param);
    children(node).forEach(visit);
  };
  visit(program);

  // A definition authored in this module is project-owned by construction: no
  // host resolution applies, and its JSX children are authored here rather
  // than handed to an opaque third-party interface.
  const isProjectLocalDefinition = (componentName: string): boolean => {
    const [root, ...members] = componentName.split(".");
    if (!root || ambiguous.has(root)) return false;
    return members.length === 0 && imported(componentName) === null && locals.has(root);
  };

  return {
    bindings,
    canWrap(componentName) {
      const [root, ...members] = componentName.split(".");
      if (!root || ambiguous.has(root)) return false;
      const binding = imported(componentName);
      if (!binding) return members.length === 0 && locals.has(root);
      const resolved = options.hostPolicy?.components[componentName];
      if (resolved) return resolved.wrap;
      // No host policy: this is the direct-compiler path, where a package
      // export is only compatible when the caller names it explicitly. The
      // host-resolved policy traces re-exports and namespace members, so this
      // fallback deliberately matches on the authored import alone.
      return options.compatibleComponentImports?.[binding.source]?.includes(binding.exportName) === true;
    },
    rendersChildren(componentName) {
      const resolved = options.hostPolicy?.components[componentName];
      if (resolved) return resolved.slots?.children === "rendered";
      return isProjectLocalDefinition(componentName);
    },
    rendersProp(componentName, prop) {
      return options.hostPolicy?.components[componentName]?.slots?.[prop] === "rendered";
    },
    componentId(componentName) {
      return options.hostPolicy?.components[componentName]?.componentId ?? null;
    },
  };
}
