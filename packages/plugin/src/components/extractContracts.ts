import { parse } from "@babel/parser";
import type { ComponentContract, ComponentPropContract, ComponentPropValue } from "./types.ts";

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

/**
 * These are the names that a component contract can confidently describe as
 * visible copy. The runtime still requires the current value to be a string
 * equal to the rendered text before offering an inline binding.
 */
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

  // Project contracts recognize all runtime string props. Structural and
  // implementation names are excluded here; package manifests can still
  // explicitly publish a text control for a project-specific visible prop.
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
      return membersForType(declaration.body as Node, declarations, seen);
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

function componentContract(
  name: string,
  propsType: Node | null,
  declarations: Map<string, Node>,
  file: string,
): ComponentContract | null {
  if (!/^[A-Z]/.test(name)) return null;
  const props = membersForType(propsType, declarations)
    .map(propertyContract)
    .filter((prop): prop is ComponentPropContract => prop !== null);
  if (props.length === 0) return null;
  return {
    componentId: `${file.replace(/\.(?:d\.)?[cm]?[jt]sx?$/, "")}#${name}`,
    name,
    file,
    props,
    provenance: "typescript",
  };
}

function unwrapExport(node: Node): Node {
  if (node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration") {
    return isNode(node.declaration) ? node.declaration : node;
  }
  return node;
}

export function extractComponentContracts(code: string, file: string): ComponentContract[] {
  let ast: Node;
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    }) as unknown as Node;
  } catch {
    return [];
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

  const contracts: ComponentContract[] = [];
  for (const statement of body) {
    const node = unwrapExport(statement);
    if (node.type === "FunctionDeclaration") {
      const name = nodeName(node.id as Node);
      const param = ((node.params as Node[] | undefined) ?? [])[0];
      const contract = name
        ? componentContract(name, propsTypeFromParam(param), declarations, file)
        : null;
      if (contract) contracts.push(contract);
      continue;
    }
    if (node.type !== "VariableDeclaration") continue;
    for (const declaration of (node.declarations as Node[] | undefined) ?? []) {
      const id = declaration.id as Node | undefined;
      const init = declaration.init as Node | undefined;
      const name = id ? nodeName(id) : null;
      if (!id || !init || !name
        || (init.type !== "ArrowFunctionExpression" && init.type !== "FunctionExpression")) continue;
      const param = ((init.params as Node[] | undefined) ?? [])[0];
      const propsType = propsTypeFromParam(param) ?? propsTypeFromVariableId(id);
      const contract = componentContract(name, propsType, declarations, file);
      if (contract) contracts.push(contract);
    }
  }
  return contracts;
}
