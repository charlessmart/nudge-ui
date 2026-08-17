import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { IconPlus } from "@tabler/icons-react";
import type { ResolvedProperty } from "@design-tool/css/model";
import { TokenField, TokenValueField } from "../tokens/TokenField.tsx";
import type { TokenEntry } from "virtual:design-tokens";
import type { SelectedElement } from "../selectionStore.ts";
import { IconButton } from "../ui/IconButton.tsx";
import {
  SideValuesField,
  SIDE_NAMES,
  MarginSideIndicator,
  type SideValueAxis,
  type SideValuePairSlot,
  type SideValueSlot,
} from "../ui/SideValuesField.tsx";
import { promoteToToken, setStyle, swapToken } from "../tokens/editActions.ts";
import { completeCssValue } from "./completeCssValue.ts";
import { valuePolicyFor } from "./valuePolicy.ts";
import { projectInspectorValues, type InspectorAxisProjection, type InspectorSpacingProjection } from "../spacing/projection.ts";
import { getStateStyleValue } from "../stateValue.ts";

function findTokenRow(rows: ResolvedProperty[], prop: string): ResolvedProperty | null {
  return rows.find((r) => r.property === prop) ?? null;
}

export interface SpacingBoxProps {
  element: SelectedElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function SpacingBox(props: SpacingBoxProps): ReactElement {
  const { element, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const allEntries = entries ?? [];
  const projection = projectInspectorValues(el, tokenRows);
  const position = getStateStyleValue(el, "position", "static").trim().toLowerCase();

  return (
    <div className="dt-editor" data-test="spacing-box">
      <div className="dt-editor__title">Spacing</div>
      <div className="dt-spacing">
        <SpacingField
          property="padding"
          projection={projection.spacing.padding}
          domElement={el}
          entries={allEntries}
          tokenRows={tokenRows}
          onAfterEdit={onAfterEdit}
        />
        <SpacingField
          property="margin"
          projection={projection.spacing.margin}
          domElement={el}
          entries={allEntries}
          tokenRows={tokenRows}
          onAfterEdit={onAfterEdit}
        />
        {position === "relative" || position === "sticky" ? <SpacingField
          property="inset"
          projection={projection.spacing.inset}
          domElement={el}
          entries={allEntries}
          tokenRows={tokenRows}
          onAfterEdit={onAfterEdit}
        /> : null}
      </div>
    </div>
  );
}

export interface SpacingFieldProps {
  property: "padding" | "margin" | "inset";
  projection: InspectorSpacingProjection;
  domElement: HTMLElement;
  entries: TokenEntry[];
  tokenRows: ResolvedProperty[];
  onAfterEdit?: () => void;
  showLabel?: boolean;
}

export function SpacingField({
  property,
  projection: spacingProjection,
  domElement: el,
  entries,
  tokenRows,
  onAfterEdit,
  showLabel = true,
}: SpacingFieldProps): ReactElement {
  const [fieldsAdded, setFieldsAdded] = useState(false);
  const pairDefinitions = [
    { axis: "horizontal", sideProperties: [sideProperty(property, "left"), sideProperty(property, "right")] as const },
    { axis: "vertical", sideProperties: [sideProperty(property, "top"), sideProperty(property, "bottom")] as const },
  ] as const;
  const sideSlots: SideValueSlot[] = SIDE_NAMES.map((side) => ({
    side,
    icon: property === "padding" ? <PaddingSideIndicator side={side} /> : <MarginSideIndicator side={side} />,
    control: (
      <TokenField
        property={sideProperty(property, side)}
        tokenRow={findTokenRow(tokenRows, sideProperty(property, side))}
        domElement={el}
        entries={entries}
        editMetadata={metadataFor(findTokenRow(tokenRows, sideProperty(property, side)))}
        onAfterEdit={onAfterEdit}
        chipVariant="small"
      />
    ),
  }));
  const forceExpanded = pairDefinitions.some(({ axis }) => (
    spacingProjection.axes[axis].fields[0].value !== spacingProjection.axes[axis].fields[1].value
  ));
  const spacingIsEmpty = SIDE_NAMES.every((side) => property === "inset"
    ? isEmptyInsetValue(spacingProjection.fields[side].value)
    : isZeroSpacingValue(spacingProjection.fields[side].value));

  useEffect(() => {
    setFieldsAdded(false);
  }, [el]);

  useEffect(() => {
    if (!spacingIsEmpty) setFieldsAdded(false);
  }, [spacingIsEmpty]);
  const pairSlots: SideValuePairSlot[] = pairDefinitions.map(({ axis, sideProperties }) => ({
    axis,
    icon: <SpacingAxisIndicator property={property} axis={axis} />,
    control: (
      <PairedTokenField
        displayProperty={`${property}-${axis}`}
        sideProperties={sideProperties}
        domElement={el}
        axisProjection={spacingProjection.axes[axis]}
        entries={entries}
        onAfterEdit={onAfterEdit}
        chipVariant="small"
      />
    ),
  }));

  return (
    <SideValuesField
      label={property}
      data-test={property === "inset" ? "layout-inset" : `spacing-${property}`}
      data-property={property}
      resetKey={el}
      pairedControls={pairSlots}
      defaultExpanded={forceExpanded}
      forceExpanded={forceExpanded}
      showLabel={showLabel}
      empty={spacingIsEmpty && !fieldsAdded}
      onAdd={() => setFieldsAdded(true)}
      emptyAction={property === "inset" ? (
        <IconButton
          variant="quiet"
          size="default"
          data-test="add-inset"
          label="Add Inset Values"
          title="Add Inset Values"
          onClick={() => setFieldsAdded(true)}
        >
          <IconPlus size={16} stroke={1.8} aria-hidden="true" />
        </IconButton>
      ) : undefined}
      sides={sideSlots}
    />
  );
}

function sideProperty(property: SpacingFieldProps["property"], side: (typeof SIDE_NAMES)[number]): string {
  return property === "inset" ? side : `${property}-${side}`;
}

function isZeroSpacingValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return !normalized || /^-?0(?:\.0+)?(?:[a-z%]+)?$/.test(normalized);
}

function isEmptyInsetValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return !normalized || normalized === "auto" || /^-?0(?:\.0+)?(?:[a-z%]+)?$/.test(normalized);
}

function PaddingSideIndicator({ side }: { side: (typeof SIDE_NAMES)[number] }): ReactElement {
  if (side === "left") {
    return (
      <svg className="dt-side-values__icon dt-side-values__side-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
        <line x1="6.75" y1="7" x2="6.75" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (side === "right") {
    return (
      <svg className="dt-side-values__icon dt-side-values__side-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
        <line x1="17" y1="7" x2="17" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (side === "bottom") {
    return (
      <svg className="dt-side-values__icon dt-side-values__side-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="21" y="3" width="18" height="18" rx="2" transform="rotate(90 21 3)" stroke="currentColor" strokeWidth="2" />
        <line x1="17" y1="17" x2="7" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg className="dt-side-values__icon dt-side-values__side-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="21" width="18" height="18" rx="2" transform="rotate(-90 3 21)" stroke="currentColor" strokeWidth="2" />
      <line x1="7" y1="7" x2="17" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SpacingAxisIndicator({
  property,
  axis,
}: {
  property: "padding" | "margin" | "inset";
  axis: SideValueAxis;
}): ReactElement {
  if (property === "padding" && axis === "horizontal") {
    return (
      <svg className="dt-side-values__icon dt-side-values__axis-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
        <line x1="6.75" y1="7" x2="6.75" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="17" y1="7" x2="17" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (property === "padding" && axis === "vertical") {
    return (
      <svg className="dt-side-values__icon dt-side-values__axis-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="21" y="3" width="18" height="18" rx="2" transform="rotate(90 21 3)" stroke="currentColor" strokeWidth="2" />
        <line x1="17" y1="6.75" x2="7" y2="6.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="17" y1="17" x2="7" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (property !== "padding" && axis === "horizontal") {
    return (
      <svg className="dt-side-values__icon dt-side-values__axis-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="6" y="5" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
        <line x1="2" y1="5" x2="2" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="22" y1="5" x2="22" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg className="dt-side-values__icon dt-side-values__axis-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="19" y="6" width="12" height="14" rx="2" transform="rotate(90 19 6)" stroke="currentColor" strokeWidth="2" />
      <line x1="19" y1="2" x2="5" y2="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="19" y1="22" x2="5" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface PairedTokenFieldProps {
  displayProperty: string;
  sideProperties: readonly [string, string];
  domElement: HTMLElement;
  axisProjection: InspectorAxisProjection;
  entries: TokenEntry[];
  onAfterEdit?: () => void;
  chipVariant?: "default" | "small";
}

function PairedTokenField({
  displayProperty,
  sideProperties,
  domElement: el,
  axisProjection,
  entries,
  onAfterEdit,
  chipVariant,
}: PairedTokenFieldProps): ReactElement {
  const row = pairTokenRow(displayProperty, axisProjection);
  const expression = Boolean(row && (row.capability === "raw" || row.capability === "composite"
    || row.modifiers?.some((modifier) => modifier.kind === "alpha")));
  const calcAuthored = row?.authored ?? row?.declaredValue ?? "";
  const activeTokenName = expression || /\bcalc\s*\(/i.test(calcAuthored) ? null : row.tokenName;
  const committedValue = expression ? row.authored || row.declaredValue || row.resolvedValue : row.resolvedValue;
  const currentToken = activeTokenName
    ? entries.find((entry) => entry.name === activeTokenName) ?? null
    : null;
  const editMetadata = metadataFor(row);

  function commitOnBothSides(value: string): void {
    const records = sideProperties.map((property) => setStyle(el, property, value, editMetadata));
    if (records.some(Boolean)) onAfterEdit?.();
  }

  return (
    <TokenValueField
      property={displayProperty}
      committedValue={committedValue}
      resolvedValue={row.resolvedValue}
      activeTokenName={activeTokenName}
      atRules={row.atRules}
      entries={entries}
      chipVariant={chipVariant}
      formatRawValue={(value) => completeCssValue(value.trim(), valuePolicyFor(displayProperty))}
      onCommitRaw={commitOnBothSides}
      onSelectToken={(chosen) => {
        const edit = activeTokenName
          ? (property: string) => swapToken(el, property, chosen, currentToken, editMetadata)
          : (property: string) => promoteToToken(el, property, chosen, editMetadata);
        const records = sideProperties.map(edit);
        if (records.some(Boolean)) onAfterEdit?.();
      }}
      onUnlink={commitOnBothSides}
    />
  );
}

function metadataFor(row: ResolvedProperty | null | undefined) {
  return row?.sourceProperty
    ? { sourceProperty: row.sourceProperty, sourceAuthoredValue: row.authored ?? row.declaredValue }
    : undefined;
}

function pairTokenRow(
  displayProperty: string,
  axisProjection: InspectorAxisProjection,
): ResolvedProperty {
  const firstField = axisProjection.fields[0];
  const first = firstField.row;
  const valuesMatch = axisProjection.state === "shared";

  return {
    ...(first ?? {}),
    property: displayProperty,
    tokenName: valuesMatch ? firstField.tokenName : null,
    declaredValue: firstField.authoredValue,
    authored: firstField.authoredValue,
    resolvedValue: firstField.value,
    capability: first?.capability ?? "box-sides",
    confidence: valuesMatch ? first?.confidence ?? "unknown" : "unknown",
    evidence: first?.evidence ?? { reason: "paired physical side values" },
  };
}
