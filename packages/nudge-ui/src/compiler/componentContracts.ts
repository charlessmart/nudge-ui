import { parse } from "@babel/parser";
import type { ComponentContract, ComponentPropContract, ComponentPropValue } from "./componentContractTypes.ts";
import { componentIdentity } from "./sourcePaths.ts";

type Node = {
  type: string;
  [key: string]: unknown;
};

function isNode(value: unknown): value is Node {
  return typeof value === "object"
    && value !== null
    && typeof (value as { type?: unknown }).type === "string";
}

function nodeName(node: Node | null | undefined): string | null {
  if (!node) return null;
  if (node.type === "Identifier" || node.type === "JSXIdentifier") {
    return typeof node.name === "string" ? node.name : null;
  }
  if (node.type === "TSQualifiedName") {
    const left = nodeName(node.left as Node);
    const right = nodeName(node.right as Node);
    return left && right ? `${left}.${right}` : null;
  }
  if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
    const object = nodeName(node.object as Node);
    const property = nodeName(node.property as Node);
    return object && property ? `${object}.${property}` : null;
  }
  return null;
}

function unwrapTypeAnnotation(node: Node | null | undefined): Node | null {
  if (!node) return null;
  return node.type === "TSTypeAnnotation"
    ? (node.typeAnnotation as Node | undefined) ?? null
    : node;
}

function literalValue(node: Node): ComponentPropValue | null {
  if (node.type === "TSLiteralType") {
    return isNode(node.literal) ? literalValue(node.literal) : null;
  }
  if (node.type === "StringLiteral" || node.type === "NumericLiteral" || node.type === "BooleanLiteral") {
    const value = node.value;
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? value
      : null;
  }
  return null;
}

const STRUCTURAL_TEXT_PROPS = new Set([
  "id",
  "className",
  "href",
  "src",
  "role",
  "style",
]);

function isStructuralTextProp(name: string): boolean {
  return STRUCTURAL_TEXT_PROPS.has(name)
    || name.startsWith("data")
    || name.startsWith("aria");
}

function isReactNodeType(node: Node): boolean {
  if (node.type !== "TSTypeReference") return false;
  return ["ReactNode", "React.ReactNode", "React.ReactChild", "React.ReactText"]
    .includes(nodeName(node.typeName as Node) ?? "");
}

function isTextType(node: Node): boolean {
  return node.type === "TSStringKeyword" || isReactNodeType(node);
}

function propertyContract(member: Node): ComponentPropContract | null {
  if (member.type !== "TSPropertySignature") return null;
  const name = nodeName(member.key as Node);
  const typeNode = unwrapTypeAnnotation(member.typeAnnotation as Node | undefined);
  if (!name || !typeNode) return null;

  // Structural names are excluded from text controls here; package manifests can still publish them explicitly.
  if (!isStructuralTextProp(name) && isTextType(typeNode)) {
    return {
      name,
      control: "text",
      options: [],
      optional: member.optional === true,
    };
  }

  if (typeNode.type === "TSBooleanKeyword") {
    return {
      name,
      control: "boolean",
      options: [false, true],
      optional: member.optional === true,
    };
  }

  if (typeNode.type !== "TSUnionType") return null;
  const values = ((typeNode.types as Node[] | undefined) ?? [])
    .map(literalValue)
    .filter((value): value is ComponentPropValue => value !== null);
  const members = (typeNode.types as Node[] | undefined) ?? [];
  if (values.length < 2 || values.length !== members.length) return null;
  const primitive = typeof values[0];
  if (!values.every((value) => typeof value === primitive)) return null;

  return {
    name,
    control: "select",
    options: values,
    optional: member.optional === true,
  };
}

function membersForType(
  node: Node | null,
  declarations: Map<string, Node>,
  seen = new Set<string>(),
): Node[] {
  if (!node) return [];
  if (node.type === "TSTypeLiteral") return (node.members as Node[] | undefined) ?? [];
  if (node.type === "TSInterfaceBody") return (node.body as Node[] | undefined) ?? [];
  if (node.type === "TSIntersectionType") {
    return ((node.types as Node[] | undefined) ?? []).flatMap((part) =>
      membersForType(part, declarations, seen));
  }
  if (node.type === "TSTypeReference") {
    const name = nodeName(node.typeName as Node);
    if (!name || seen.has(name)) return [];
    const declaration = declarations.get(name);
    if (!declaration) return [];
    seen.add(name);
    if (declaration.type === "TSInterfaceDeclaration") {
      const inherited = ((declaration.extends as Node[] | undefined) ?? []).flatMap((heritage) =>
        membersForType(heritageReference(heritage), declarations, seen));
      return [...inherited, ...membersForType(declaration.body as Node, declarations, seen)];
    }
    if (declaration.type === "TSTypeAliasDeclaration") {
      return membersForType(declaration.typeAnnotation as Node, declarations, seen);
    }
  }
  return [];
}

function propsTypeFromParam(param: Node | null | undefined): Node | null {
  if (!param) return null;
  if (param.type === "AssignmentPattern") return propsTypeFromParam(param.left as Node);
  return unwrapTypeAnnotation(param.typeAnnotation as Node | undefined);
}

function propsTypeFromVariableId(id: Node): Node | null {
  const annotation = unwrapTypeAnnotation(id.typeAnnotation as Node | undefined);
  if (!annotation || annotation.type !== "TSTypeReference") return null;
  const typeName = nodeName(annotation.typeName as Node);
  if (typeName !== "React.FC" && typeName !== "FC" && typeName !== "React.FunctionComponent"
    && typeName !== "FunctionComponent") return null;
  const params = annotation.typeParameters as { params?: Node[] } | undefined;
  return params?.params?.[0] ?? null;
}

interface ComponentInitializer {
  functionNode: Node;
  propsType: Node | null;
}

function componentInitializer(node: Node): ComponentInitializer | null {
  if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") {
    return { functionNode: node, propsType: null };
  }
  if (node.type !== "CallExpression") return null;
  const wrapperName = nodeName(node.callee as Node)?.split(".").at(-1);
  if (wrapperName !== "memo" && wrapperName !== "forwardRef") return null;
  const argument = ((node.arguments as Node[] | undefined) ?? [])[0];
  if (!argument) return null;
  const inner = componentInitializer(argument);
  if (!inner) return null;
  if (wrapperName !== "forwardRef") return inner;
  const typeParameters = (
    (node.typeParameters as { params?: Node[] } | undefined)
    ?? (node.typeArguments as { params?: Node[] } | undefined)
  )?.params ?? [];
  return {
    functionNode: inner.functionNode,
    propsType: inner.propsType ?? typeParameters[1] ?? null,
  };
}

/** Literal defaults of a destructured props parameter: `({ variant = "primary", loading = false })`. */
function destructuredDefaults(param: Node | null | undefined): Map<string, ComponentPropValue> {
  const defaults = new Map<string, ComponentPropValue>();
  let pattern = param;
  if (pattern?.type === "AssignmentPattern") pattern = pattern.left as Node;
  if (pattern?.type !== "ObjectPattern") return defaults;
  for (const property of (pattern.properties as Node[] | undefined) ?? []) {
    if (property.type !== "ObjectProperty" || property.computed === true) continue;
    const key = property.key as Node;
    const name = key.type === "Identifier" ? nodeName(key) : key.type === "StringLiteral" ? String(key.value) : null;
    const value = property.value as Node;
    if (!name || value.type !== "AssignmentPattern") continue;
    const literal = isNode(value.right) ? literalValue(value.right) : null;
    if (literal !== null) defaults.set(name, literal);
  }
  return defaults;
}

function withDefault(prop: ComponentPropContract, defaults: Map<string, ComponentPropValue>): ComponentPropContract {
  const value = defaults.get(prop.name);
  if (value === undefined) return prop;
  const valid = prop.control === "boolean"
    ? typeof value === "boolean"
    : prop.control === "select"
      ? prop.options.includes(value)
      : typeof value === "string";
  return valid ? { ...prop, defaultValue: value } : prop;
}


/** An interface `extends` entry as a type reference (Babel emits TSExpressionWithTypeArguments or TSInterfaceHeritage). */
function heritageReference(heritage: Node): Node {
  return {
    type: "TSTypeReference",
    typeName: heritage.expression ?? heritage.typeName,
    typeParameters: heritage.typeParameters ?? heritage.typeArguments,
  };
}

function typeArguments(node: Node): Node[] {
  return (
    (node.typeParameters as { params?: Node[] } | undefined)
    ?? (node.typeArguments as { params?: Node[] } | undefined)
  )?.params ?? [];
}

// ---------------------------------------------------------------------------
// cva / tailwind-variants support
// ---------------------------------------------------------------------------

interface VariantProp {
  name: string;
  keys: string[];
  defaultValue?: string;
}

type VariantTable = VariantProp[];

function propertyKeyName(property: Node): string | null {
  if (property.type !== "ObjectProperty" || property.computed === true) return null;
  const key = property.key as Node;
  if (key.type === "Identifier") return nodeName(key);
  if (key.type === "StringLiteral" || key.type === "NumericLiteral") return String(key.value);
  return null;
}

function objectProperty(object: Node, name: string): Node | null {
  for (const property of (object.properties as Node[] | undefined) ?? []) {
    if (propertyKeyName(property) === name) return property.value as Node;
  }
  return null;
}

function unwrapExpression(node: Node): Node {
  let current = node;
  while (
    current.type === "TSAsExpression" || current.type === "TSSatisfiesExpression"
    || current.type === "ParenthesizedExpression" || current.type === "TSNonNullExpression"
  ) current = current.expression as Node;
  return current;
}

function variantTableFromCall(call: Node): VariantTable | null {
  const callee = nodeName(call.callee as Node)?.split(".").at(-1);
  if (callee !== "cva" && callee !== "tv") return null;
  for (const argument of (call.arguments as Node[] | undefined) ?? []) {
    const config = unwrapExpression(argument);
    if (config.type !== "ObjectExpression") continue;
    const variants = objectProperty(config, "variants");
    if (!variants || unwrapExpression(variants).type !== "ObjectExpression") continue;
    const defaultVariants = objectProperty(config, "defaultVariants");
    const defaultsObject = defaultVariants ? unwrapExpression(defaultVariants) : null;
    const table: VariantTable = [];
    for (const property of (unwrapExpression(variants).properties as Node[] | undefined) ?? []) {
      const name = propertyKeyName(property);
      const values = unwrapExpression(property.value as Node);
      if (!name || values.type !== "ObjectExpression") continue;
      const keys = ((values.properties as Node[] | undefined) ?? [])
        .map(propertyKeyName)
        .filter((key): key is string => key !== null);
      if (keys.length === 0) continue;
      const entry: VariantProp = { name, keys };
      const defaultNode = defaultsObject?.type === "ObjectExpression"
        ? objectProperty(defaultsObject, name)
        : null;
      const literal = defaultNode ? literalValue(unwrapExpression(defaultNode)) : null;
      if (literal !== null) entry.defaultValue = String(literal);
      table.push(entry);
    }
    return table;
  }
  return null;
}

function variantProp(entry: VariantProp, defaults: Map<string, ComponentPropValue>): ComponentPropContract {
  const isBoolean = entry.keys.every((key) => key === "true" || key === "false");
  const options: ComponentPropValue[] = isBoolean
    ? [false, true]
    : [...new Set(entry.keys)];
  const prop: ComponentPropContract = {
    name: entry.name,
    control: isBoolean ? "boolean" : "select",
    options,
    optional: true,
  };
  const authored = defaults.get(entry.name)
    ?? (entry.defaultValue === undefined
      ? undefined
      : isBoolean ? entry.defaultValue === "true" : entry.defaultValue);
  const candidate = authored === undefined || !isBoolean || typeof authored === "boolean"
    ? authored
    : undefined;
  return candidate === undefined ? prop : withDefault(prop, new Map([[entry.name, candidate]]));
}

// ---------------------------------------------------------------------------
// Props type inspection: VariantProps references and intrinsic element props
// ---------------------------------------------------------------------------

const VOID_ELEMENTS = new Set([
  "input", "img", "br", "hr", "meta", "link", "area", "base", "col", "embed",
  "source", "track", "wbr", "textarea",
]);

const INTRINSIC_PROPS_TYPES = new Set([
  "ComponentProps", "ComponentPropsWithoutRef", "ComponentPropsWithRef",
]);

/** HTML attribute interfaces whose element has no children, keyed by the element-specific prefix. */
const VOID_ATTRIBUTE_TYPES = new Set([
  "InputHTMLAttributes", "ImgHTMLAttributes", "TextareaHTMLAttributes", "AreaHTMLAttributes",
  "BaseHTMLAttributes", "ColHTMLAttributes", "EmbedHTMLAttributes", "LinkHTMLAttributes",
  "MetaHTMLAttributes", "SourceHTMLAttributes", "TrackHTMLAttributes",
]);

interface PropsTypeInfo {
  variantTables: string[];
  /** True when the type pulls in props of a non-void intrinsic element. */
  acceptsChildren: boolean;
}

function inspectPropsType(
  node: Node | null,
  declarations: Map<string, Node>,
  info: PropsTypeInfo = { variantTables: [], acceptsChildren: false },
  seen = new Set<string>(),
): PropsTypeInfo {
  if (!node) return info;
  if (node.type === "TSIntersectionType" || node.type === "TSUnionType") {
    for (const part of (node.types as Node[] | undefined) ?? []) inspectPropsType(part, declarations, info, seen);
    return info;
  }
  if (node.type === "TSParenthesizedType") {
    return inspectPropsType(node.typeAnnotation as Node, declarations, info, seen);
  }
  if (node.type !== "TSTypeReference") return info;
  const fullName = nodeName(node.typeName as Node);
  if (!fullName) return info;
  const name = fullName.split(".").at(-1) ?? fullName;
  const args = typeArguments(node);

  if (name === "VariantProps") {
    const query = args[0];
    const target = query?.type === "TSTypeQuery" ? nodeName(query.exprName as Node) : null;
    if (target) info.variantTables.push(target);
    return info;
  }
  if (INTRINSIC_PROPS_TYPES.has(name)) {
    const tag = args[0] ? literalValue(args[0]) : null;
    if (typeof tag === "string" && /^[a-z][a-z0-9]*$/.test(tag) && !VOID_ELEMENTS.has(tag)) {
      info.acceptsChildren = true;
    }
    return info;
  }
  if (name === "HTMLAttributes" || (name.endsWith("HTMLAttributes") && !VOID_ATTRIBUTE_TYPES.has(name))) {
    info.acceptsChildren = true;
    return info;
  }
  if (seen.has(fullName)) return info;
  const declaration = declarations.get(fullName);
  if (!declaration) return info;
  seen.add(fullName);
  if (declaration.type === "TSInterfaceDeclaration") {
    for (const heritage of (declaration.extends as Node[] | undefined) ?? []) {
      inspectPropsType(heritageReference(heritage), declarations, info, seen);
    }
  } else if (declaration.type === "TSTypeAliasDeclaration") {
    inspectPropsType(declaration.typeAnnotation as Node, declarations, info, seen);
  }
  return info;
}

/** Whether the component spreads props onto a non-void lowercase host element. */
function spreadsIntoHostElement(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(spreadsIntoHostElement);
  if (!isNode(node)) return false;
  if (node.type === "JSXOpeningElement") {
    const tag = nodeName(node.name as Node);
    const attributes = (node.attributes as Node[] | undefined) ?? [];
    if (tag && /^[a-z]/.test(tag) && !VOID_ELEMENTS.has(tag)
      && attributes.some((attribute) => attribute.type === "JSXSpreadAttribute")) return true;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;
    if (typeof value === "object" && value !== null && spreadsIntoHostElement(value)) return true;
  }
  return false;
}

function componentContract(
  name: string,
  propsType: Node | null,
  declarations: Map<string, Node>,
  file: string,
  param?: Node | null,
  variantTables: Map<string, VariantTable> = new Map(),
  functionNode?: Node | null,
): ComponentContract | null {
  if (!/^[A-Z]/.test(name)) return null;
  const defaults = destructuredDefaults(param);
  const props = membersForType(propsType, declarations)
    .map(propertyContract)
    .filter((prop): prop is ComponentPropContract => prop !== null)
    .map((prop) => withDefault(prop, defaults));
  const info = inspectPropsType(propsType, declarations);
  const taken = new Set(props.map((prop) => prop.name));
  for (const target of info.variantTables) {
    for (const entry of variantTables.get(target) ?? []) {
      if (taken.has(entry.name)) continue;
      taken.add(entry.name);
      props.push(variantProp(entry, defaults));
    }
  }
  if (!taken.has("children") && (info.acceptsChildren || (propsType !== null && functionNode && spreadsIntoHostElement(functionNode.body)))) {
    props.push({ name: "children", control: "text", options: [], optional: true });
  }
  if (props.length === 0) return null;
  return {
    componentId: componentIdentity(file, name),
    name,
    file,
    props,
    provenance: "typescript",
    ...(functionNode && rendersOnlyPlumbing(name, functionNode) ? { role: "wrapper" as const } : {}),
  };
}

/** `Theme.Provider`, `motion.div`; an unreadable tag (namespaced) yields "" and counts as UI. */
function jsxTagName(node: Node): string {
  if (node.type === "JSXMemberExpression") {
    const object = jsxTagName(node.object as Node);
    const property = nodeName(node.property as Node);
    return object && property ? `${object}.${property}` : "";
  }
  return nodeName(node) ?? "";
}

function isCreateContext(node: Node): boolean {
  const call = unwrapExpression(node);
  return call?.type === "CallExpression" && nodeName(call.callee as Node)?.split(".").at(-1) === "createContext";
}

// Tags that compose behaviour rather than UI: fragments, React's own boundaries, context providers and consumers.
const PLUMBING_TAG = /(?:^|\.)(?:Fragment|Suspense|StrictMode|Profiler|Provider|Consumer)$|(?:Provider|Context|Boundary)$/;

/**
 * Whether a component renders no element of its own: it is named `…Provider`, every JSX tag it writes is a provider,
 * boundary or fragment, or it writes no JSX and returns `children` or nothing. `<Card>` composing `<Box>` still renders UI, so a
 * component tag that is not plumbing keeps the component in the library.
 */
function rendersOnlyPlumbing(name: string, functionNode: Node): boolean {
  // Providers often render a hidden helper beside the context (an `<audio>` element, an effect watcher).
  if (/Provider$/.test(name)) return true;
  let sawJsx = false;
  let rendersUi = false;
  let createsElements = false;
  const visit = (node: unknown): void => {
    if (rendersUi) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isNode(node)) return;
    if (node.type === "JSXFragment") sawJsx = true;
    if (node.type === "JSXOpeningElement") {
      sawJsx = true;
      const tag = jsxTagName(node.name as Node);
      if (/^[a-z]/.test(tag) || !PLUMBING_TAG.test(tag)) rendersUi = true;
    }
    if (node.type === "Identifier" && (node.name === "createElement" || node.name === "cloneElement")) createsElements = true;
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;
      if (typeof value === "object" && value !== null) visit(value);
    }
  };
  visit(functionNode.body);
  if (rendersUi) return false;
  // Without JSX, `createElement` may build anything.
  return sawJsx || !createsElements;
}

function unwrapExport(node: Node): Node {
  if (node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration") {
    return isNode(node.declaration) ? node.declaration : node;
  }
  return node;
}

export interface ComponentCatalog {
  contracts: ComponentContract[];
  /** Ids of every wrapper component in the file, including ones whose props only the type checker can read. */
  wrapperIds: string[];
}

export function extractComponentContracts(code: string, file: string): ComponentContract[] {
  return extractComponentCatalog(code, file).contracts;
}

export function extractComponentCatalog(code: string, file: string): ComponentCatalog {
  let ast: Node;
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    }) as unknown as Node;
  } catch {
    return { contracts: [], wrapperIds: [] };
  }

  const program = ast.program as Node | undefined;
  const body = (program?.body as Node[] | undefined) ?? [];
  const declarations = new Map<string, Node>();
  for (const statement of body) {
    const node = unwrapExport(statement);
    if (node.type !== "TSInterfaceDeclaration" && node.type !== "TSTypeAliasDeclaration") continue;
    const name = nodeName(node.id as Node);
    if (name) declarations.set(name, node);
  }

  const variantTables = new Map<string, VariantTable>();
  for (const statement of body) {
    const node = unwrapExport(statement);
    if (node.type !== "VariableDeclaration") continue;
    for (const declaration of (node.declarations as Node[] | undefined) ?? []) {
      const id = declaration.id as Node | undefined;
      const init = declaration.init as Node | undefined;
      const name = id ? nodeName(id) : null;
      const call = init ? unwrapExpression(init) : null;
      if (!name || call?.type !== "CallExpression") continue;
      const table = variantTableFromCall(call);
      if (table) variantTables.set(name, table);
    }
  }

  const contracts: ComponentContract[] = [];
  const wrapperIds: string[] = [];
  const noteWrapper = (name: string, node: Node): void => {
    if (/^[A-Z]/.test(name) && (isCreateContext(node) || rendersOnlyPlumbing(name, node))) wrapperIds.push(componentIdentity(file, name));
  };
  for (const statement of body) {
    const node = unwrapExport(statement);
    if (node.type === "FunctionDeclaration") {
      const name = nodeName(node.id as Node);
      const param = ((node.params as Node[] | undefined) ?? [])[0];
      const contract = name
        ? componentContract(name, propsTypeFromParam(param), declarations, file, param, variantTables, node)
        : null;
      if (contract) contracts.push(contract);
      if (name) noteWrapper(name, node);
      continue;
    }
    if (node.type !== "VariableDeclaration") continue;
    for (const declaration of (node.declarations as Node[] | undefined) ?? []) {
      const id = declaration.id as Node | undefined;
      const init = declaration.init as Node | undefined;
      const name = id ? nodeName(id) : null;
      const initializer = init ? componentInitializer(init) : null;
      // React 19 renders a context as `<ThemeContext value>`, so the checker lists it as a component.
      if (name && init && isCreateContext(init)) noteWrapper(name, init);
      if (!id || !initializer || !name) continue;
      const param = ((initializer.functionNode.params as Node[] | undefined) ?? [])[0];
      const propsType = propsTypeFromParam(param)
        ?? initializer.propsType
        ?? propsTypeFromVariableId(id);
      const contract = componentContract(name, propsType, declarations, file, param, variantTables, initializer.functionNode);
      if (contract) contracts.push(contract);
      noteWrapper(name, initializer.functionNode);
    }
  }
  return { contracts, wrapperIds };
}
