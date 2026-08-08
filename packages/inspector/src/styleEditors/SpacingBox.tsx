import type { ReactElement } from "react";
import type { ResolvedProperty } from "@design-tool/css/model";
import { TokenField, TokenValueField } from "../tokens/TokenField.tsx";
import type { TokenEntry } from "virtual:design-tokens";
import type { SelectedElement } from "../selectionStore.ts";
import { SideValuesField, SIDE_NAMES, type SideValuePairSlot, type SideValueSlot } from "../ui/SideValuesField.tsx";
import { promoteToToken, setStyle, swapToken } from "../tokens/editActions.ts";
import { completeCssValue } from "./completeCssValue.ts";
import { valuePolicyFor } from "./valuePolicy.ts";
import { projectInspectorValues, type InspectorAxisProjection, type InspectorSpacingProjection } from "../spacing/projection.ts";
import { InsetSection } from "./InsetSection.tsx";

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

  return (
    <>
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
        </div>
      </div>
      <InsetSection
        element={element}
        entries={allEntries}
        tokenRows={tokenRows}
        onAfterEdit={onAfterEdit}
      />
    </>
  );
}

interface SpacingFieldProps {
  property: "padding" | "margin";
  projection: InspectorSpacingProjection;
  domElement: HTMLElement;
  entries: TokenEntry[];
  tokenRows: ResolvedProperty[];
  onAfterEdit?: () => void;
  showLabel?: boolean;
}

function SpacingField({
  property,
  projection: spacingProjection,
  domElement: el,
  entries,
  tokenRows,
  onAfterEdit,
  showLabel = true,
}: SpacingFieldProps): ReactElement {
  const pairDefinitions = [
    { axis: "horizontal", sideProperties: [`${property}-left`, `${property}-right`] as const },
    { axis: "vertical", sideProperties: [`${property}-top`, `${property}-bottom`] as const },
  ] as const;
  const sideSlots: SideValueSlot[] = SIDE_NAMES.map((side) => ({
    side,
    control: (
      <TokenField
        property={`${property}-${side}`}
        tokenRow={findTokenRow(tokenRows, `${property}-${side}`)}
        domElement={el}
        entries={entries}
        editMetadata={metadataFor(findTokenRow(tokenRows, `${property}-${side}`))}
        onAfterEdit={onAfterEdit}
        chipVariant="small"
      />
    ),
  }));
  const forceExpanded = pairDefinitions.some(({ axis }) => (
    spacingProjection.axes[axis].fields[0].value !== spacingProjection.axes[axis].fields[1].value
  ));
  const pairSlots: SideValuePairSlot[] = pairDefinitions.map(({ axis, sideProperties }) => ({
    axis,
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
      data-test={`spacing-${property}`}
      data-property={property}
      resetKey={el}
      pairedControls={pairSlots}
      defaultExpanded={forceExpanded}
      forceExpanded={forceExpanded}
      showLabel={showLabel}
      sides={sideSlots}
    />
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
