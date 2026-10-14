import type { ResolvedProperty } from "../../css/model/index.ts";
import { getStateStyleValue } from "../shell/stateValue.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

const SIDES = ["top", "right", "bottom", "left"] as const;

/** Derived from SIDES so the union and the iteration set cannot drift apart. */
export type ProjectionSide = (typeof SIDES)[number];
export type ProjectionGroup = "padding" | "margin" | "inset";
export type ProjectionAxis = "horizontal" | "vertical";
export type ProjectionState = "shared" | "mixed";

export interface InspectorFieldProjection {
  property: string;
  authoredValue: string;
  value: string;
  tokenName: string | null;
  sourceProperty?: string;
  row: ResolvedProperty | null;
}

export interface InspectorAxisProjection {
  axis: ProjectionAxis;
  sides: readonly [ProjectionSide, ProjectionSide];
  state: ProjectionState;
  fields: readonly [InspectorFieldProjection, InspectorFieldProjection];
}

export interface InspectorSpacingProjection {
  property: ProjectionGroup;
  linked: boolean;
  fields: Record<ProjectionSide, InspectorFieldProjection>;
  axes: Record<ProjectionAxis, InspectorAxisProjection>;
}

export interface InspectorProjection {
  spacing: Record<ProjectionGroup, InspectorSpacingProjection>;
}

const AXIS_SIDES = {
  // CSS physical-side order per axis, so a mixed pair reads right/left, top/bottom.
  horizontal: ["right", "left"] as const,
  vertical: ["top", "bottom"] as const,
} satisfies Record<ProjectionAxis, readonly [ProjectionSide, ProjectionSide]>;

function fieldProjection(
  el: HTMLElement,
  rows: ResolvedProperty[],
  property: string,
): InspectorFieldProjection {
  const row = rows.find((candidate) => candidate.property === property) ?? null;
  // Resolved rows can be one render behind; the live value is the grouping authority, the row only supplies provenance.
  const liveValue = getStateStyleValue(el, property);
  const rowValue = row?.computed || row?.resolvedValue;
  const rowIsCurrent = !liveValue || !row || Boolean(row.sourceProperty) || !rowValue || rowValue === liveValue;
  const effectiveRow = rowIsCurrent ? row : null;
  const value = liveValue || row?.resolvedValue || "";
  return {
    property,
    authoredValue: effectiveRow?.authored ?? effectiveRow?.declaredValue ?? value,
    value,
    tokenName: effectiveRow?.tokenName ?? null,
    sourceProperty: effectiveRow?.sourceProperty,
    row: effectiveRow,
  };
}

function fieldSignature(field: InspectorFieldProjection): string {
  // Source property is provenance, not value identity, so it stays out of the signature.
  return [field.authoredValue, field.tokenName ?? "", field.value].join("|");
}

function axisProjection(
  axis: ProjectionAxis,
  fields: Record<ProjectionSide, InspectorFieldProjection>,
): InspectorAxisProjection {
  const sides = AXIS_SIDES[axis];
  const pair = [fields[sides[0]], fields[sides[1]]] as const;
  return {
    axis,
    sides,
    state: fieldSignature(pair[0]) === fieldSignature(pair[1]) ? "shared" : "mixed",
    fields: pair,
  };
}

function spacingProjection(
  el: HTMLElement,
  rows: ResolvedProperty[],
  property: ProjectionGroup,
): InspectorSpacingProjection {
  // SAFETY: SIDES contains exactly the ProjectionSide keys, so the resulting record is complete.
  const fields = Object.fromEntries(SIDES.map((side) => {
    const field = fieldProjection(el, rows, property === "inset" ? side : `${property}-${side}`);
    return [side, field];
  })) as Record<ProjectionSide, InspectorFieldProjection>;
  const signatures = SIDES.map((side) => fieldSignature(fields[side]));
  return {
    property,
    linked: new Set(signatures).size === 1,
    fields,
    axes: {
      horizontal: axisProjection("horizontal", fields),
      vertical: axisProjection("vertical", fields),
    },
  };
}

export function projectInspectorValues(
  el: HTMLElement,
  rows: ResolvedProperty[],
): InspectorProjection {
  return {
    spacing: {
      padding: spacingProjection(el, rows, "padding"),
      margin: spacingProjection(el, rows, "margin"),
      inset: spacingProjection(el, rows, "inset"),
    },
  };
}

function selectionField(
  selection: StyleSelection,
  property: string,
): InspectorFieldProjection {
  const selectedProperty = selection.getProperty(property);
  const mixed = selectedProperty?.value.kind === "mixed";
  const value = selectedProperty?.value.kind === "common" ? selectedProperty.value.value : "";
  const row = selectedProperty?.primaryRow ?? null;
  return {
    property,
    authoredValue: mixed ? "Mixed" : value,
    value: mixed ? "Mixed" : value,
    tokenName: selectedProperty?.token.kind === "common" ? selectedProperty.token.name : null,
    sourceProperty: row?.sourceProperty,
    row,
  };
}

function selectionAxis(
  axis: ProjectionAxis,
  fields: Record<ProjectionSide, InspectorFieldProjection>,
): InspectorAxisProjection {
  const sides = AXIS_SIDES[axis];
  const pair = [fields[sides[0]], fields[sides[1]]] as const;
  return {
    axis,
    sides,
    state: pair[0].value === pair[1].value ? "shared" : "mixed",
    fields: pair,
  };
}

function selectionSpacing(
  selection: StyleSelection,
  property: ProjectionGroup,
): InspectorSpacingProjection {
  // SAFETY: SIDES supplies exactly the ProjectionSide keys, so fromEntries yields that exact record shape.
  const fields = Object.fromEntries(SIDES.map((side) => {
    const field = selectionField(selection, property === "inset" ? side : `${property}-${side}`);
    return [side, field];
  })) as Record<ProjectionSide, InspectorFieldProjection>;
  const signatures = SIDES.map((side) => fieldSignature(fields[side]));
  return {
    property,
    linked: new Set(signatures).size === 1,
    fields,
    axes: {
      horizontal: selectionAxis("horizontal", fields),
      vertical: selectionAxis("vertical", fields),
    },
  };
}

export function projectInspectorValuesForSelection(selection: StyleSelection): InspectorProjection {
  if (selection.elements.length === 1) {
    return projectInspectorValues(selection.primary.domElement, [...selection.primaryRows]);
  }
  return {
    spacing: {
      padding: selectionSpacing(selection, "padding"),
      margin: selectionSpacing(selection, "margin"),
      inset: selectionSpacing(selection, "inset"),
    },
  };
}

export function projectionSides(axis: ProjectionAxis): readonly [ProjectionSide, ProjectionSide] {
  return AXIS_SIDES[axis];
}
