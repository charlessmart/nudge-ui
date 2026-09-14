// Compatibility re-export. Production callers use the spacing module directly;
// existing conformance consumers can keep their import while the seam moves.
export {
  projectInspectorValues,
  projectionSides,
} from "../spacing/projection.ts";
export type {
  InspectorAxisProjection,
  InspectorFieldProjection,
  InspectorProjection,
  InspectorSpacingProjection,
  ProjectionAxis,
  ProjectionGroup,
  ProjectionSide,
  ProjectionState,
} from "../spacing/projection.ts";
