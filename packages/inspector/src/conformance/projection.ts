import type { ResolvedProperty } from "../tokens/resolution.ts";
import { getStateStyleValue } from "../stateValue.ts";

export type ProjectionSide = "top" | "right" | "bottom" | "left";
export type ProjectionGroup = "padding" | "margin";

export interface InspectorFieldProjection {
  property: string;
  authoredValue: string;
  value: string;
  tokenName: string | null;
  sourceProperty?: string;
}

export interface InspectorSpacingProjection {
  property: ProjectionGroup;
  linked: boolean;
  fields: Record<ProjectionSide, InspectorFieldProjection>;
}

export interface InspectorProjection {
  spacing: Record<ProjectionGroup, InspectorSpacingProjection>;
}

const SIDES: readonly ProjectionSide[] = ["top", "right", "bottom", "left"];

function fieldProjection(
  el: HTMLElement,
  rows: ResolvedProperty[],
  property: string,
): InspectorFieldProjection {
  const row = rows.find((candidate) => candidate.property === property);
  const value = row?.resolvedValue || getStateStyleValue(el, property);
  return {
    property,
    authoredValue: row?.authored ?? row?.declaredValue ?? value,
    value,
    tokenName: row?.tokenName ?? null,
    sourceProperty: row?.sourceProperty,
  };
}

function spacingProjection(
  el: HTMLElement,
  rows: ResolvedProperty[],
  property: ProjectionGroup,
): InspectorSpacingProjection {
  const fields = Object.fromEntries(SIDES.map((side) => {
    const field = fieldProjection(el, rows, `${property}-${side}`);
    return [side, field];
  })) as Record<ProjectionSide, InspectorFieldProjection>;
  const signatures = SIDES.map((side) => {
    const field = fields[side];
    return `${field.authoredValue}|${field.tokenName}|${field.value}`;
  });
  return { property, linked: new Set(signatures).size === 1, fields };
}

export function projectInspectorValues(
  el: HTMLElement,
  rows: ResolvedProperty[],
): InspectorProjection {
  return {
    spacing: {
      padding: spacingProjection(el, rows, "padding"),
      margin: spacingProjection(el, rows, "margin"),
    },
  };
}
