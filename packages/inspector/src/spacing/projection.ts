import type { ResolvedProperty } from "@nudge-ui/css/model";
import { getStateStyleValue } from "../stateValue.ts";

export type ProjectionSide = "top" | "right" | "bottom" | "left";
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

const SIDES: readonly ProjectionSide[] = ["top", "right", "bottom", "left"];
const AXIS_SIDES = {
  // Preserve CSS physical-side order within each axis. This makes a mixed
  // horizontal value read as right, left and a mixed vertical value as top,
  // bottom when the compact editor renders both values.
  horizontal: ["right", "left"] as const,
  vertical: ["top", "bottom"] as const,
} satisfies Record<ProjectionAxis, readonly [ProjectionSide, ProjectionSide]>;

function fieldProjection(
  el: HTMLElement,
  rows: ResolvedProperty[],
  property: string,
): InspectorFieldProjection {
  const row = rows.find((candidate) => candidate.property === property) ?? null;
  // The selected element is the rendering authority. Resolved rows can be
  // one render behind while the debounced inspector refreshes, so use the
  // live computed side value for grouping when available and retain the row
  // for authored/token/source provenance.
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
  // Source property is provenance, not visible value identity. Two physical
  // longhands with the same authored/token value may still use the compact
  // axis control; the individual source properties remain attached to their
  // fields for prompt generation and edit metadata.
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

/**
 * Projects resolved physical side facts into the compact spacing UI shape.
 * Authored value, token identity, computed value, and source property all
 * participate in shared/mixed detection so visually equal values cannot
 * accidentally discard authored CSS intent. Source properties remain on each
 * field as provenance but do not by themselves force expansion.
 */
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

export function projectionSides(axis: ProjectionAxis): readonly [ProjectionSide, ProjectionSide] {
  return AXIS_SIDES[axis];
}
