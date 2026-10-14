import { childNodes, identifier, isNode, type SyntaxNode } from "./ast.ts";

export type { SyntaxNode } from "./ast.ts";

export interface ComponentInstrumentationOptions {
  /** Exact specifier → exported names (`default` for a default import); a discovered contract alone never opts in. */
  compatibleComponentImports?: Readonly<Record<string, readonly string[]>>;
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

/** Unknown and shadowed bindings are deliberately excluded: losing a semantic control beats altering an app's protocol. */
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
    childNodes(node).forEach(visit);
  };
  visit(program);

  // Authored in this module, so its JSX children are not handed to an opaque third-party interface.
  const isProjectLocalComponent = (componentName: string): boolean => {
    const [root, ...members] = componentName.split(".");
    if (!root || ambiguous.has(root)) return false;
    return members.length === 0 && imported(componentName) === null && locals.has(root);
  };

  return {
    bindings,
    canWrap(componentName) {
      const binding = imported(componentName);
      if (!binding) return isProjectLocalComponent(componentName);
      const resolved = options.hostPolicy?.components[componentName];
      if (resolved) return resolved.wrap;
      // Direct-compiler fallback: matches the authored import alone, unlike host resolution which traces re-exports.
      return options.compatibleComponentImports?.[binding.source]?.includes(binding.exportName) === true;
    },
    rendersChildren(componentName) {
      const resolved = options.hostPolicy?.components[componentName];
      if (resolved) return resolved.slots?.children === "rendered";
      return isProjectLocalComponent(componentName);
    },
    rendersProp(componentName, prop) {
      return options.hostPolicy?.components[componentName]?.slots?.[prop] === "rendered";
    },
    componentId(componentName) {
      return options.hostPolicy?.components[componentName]?.componentId ?? null;
    },
  };
}
