import type { ReactElement } from "react";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import { TokenField, TokenValueField } from "../tokens/TokenField.tsx";
import type { TokenEntry } from "virtual:design-tokens";
import type { SelectedElement } from "../selectionStore.ts";
import { SideValuesField, SIDE_NAMES, type SideValuePairSlot, type SideValueSlot } from "../ui/SideValuesField.tsx";
import { getStateStyleValue } from "../stateValue.ts";
import { promoteToToken, setStyle, swapToken } from "../tokens/editActions.ts";
import { completeCssValue } from "./completeCssValue.ts";
import { valuePolicyFor } from "./valuePolicy.ts";

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
  const spacingGroups = [
    { label: "padding", property: "padding" },
    { label: "margin", property: "margin" },
  ] as const;

  return (
    <div className="dt-editor" data-test="spacing-box">
      <div className="dt-editor__title">Spacing</div>
      <div className="dt-spacing">
        {spacingGroups.map(({ label, property }) => {
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
                entries={allEntries}
                onAfterEdit={onAfterEdit}
              />
            ),
          }));
          const forceExpanded = pairDefinitions.some(({ sideProperties }) => (
            pairIsAsymmetric(el, sideProperties)
          ));
          const pairSlots: SideValuePairSlot[] = pairDefinitions.map(({ axis, sideProperties }) => ({
            axis,
            control: (
              <PairedTokenField
                displayProperty={`${property}-${axis}`}
                sideProperties={sideProperties}
                domElement={el}
                rows={tokenRows}
                entries={allEntries}
                onAfterEdit={onAfterEdit}
              />
            ),
          }));

          return (
            <SideValuesField
              key={property}
              label={label}
              data-test={`spacing-${property}`}
              data-property={property}
              resetKey={el}
              pairedControls={pairSlots}
              defaultExpanded={forceExpanded}
              forceExpanded={forceExpanded}
              sides={sideSlots}
            />
          );
        })}
      </div>
    </div>
  );
}

interface PairedTokenFieldProps {
  displayProperty: string;
  sideProperties: readonly [string, string];
  domElement: HTMLElement;
  rows: ResolvedProperty[];
  entries: TokenEntry[];
  onAfterEdit?: () => void;
}

function PairedTokenField({
  displayProperty,
  sideProperties,
  domElement: el,
  rows,
  entries,
  onAfterEdit,
}: PairedTokenFieldProps): ReactElement {
  const row = pairTokenRow(el, rows, displayProperty, sideProperties);
  const expression = Boolean(row && (row.capability === "raw" || row.capability === "composite"
    || row.modifiers?.some((modifier) => modifier.kind === "alpha")));
  const activeTokenName = expression ? null : row.tokenName;
  const committedValue = expression ? row.authored || row.declaredValue || row.resolvedValue : row.resolvedValue;
  const currentToken = activeTokenName
    ? entries.find((entry) => entry.name === activeTokenName) ?? null
    : null;

  function commitOnBothSides(value: string): void {
    const records = sideProperties.map((property) => setStyle(el, property, value));
    if (records.some(Boolean)) onAfterEdit?.();
  }

  return (
    <TokenValueField
      property={displayProperty}
      committedValue={committedValue}
      resolvedValue={row.resolvedValue}
      activeTokenName={activeTokenName}
      entries={entries}
      formatRawValue={(value) => completeCssValue(value.trim(), valuePolicyFor(displayProperty))}
      onCommitRaw={commitOnBothSides}
      onSelectToken={(chosen) => {
        const edit = activeTokenName
          ? (property: string) => swapToken(el, property, chosen, currentToken)
          : (property: string) => promoteToToken(el, property, chosen);
        const records = sideProperties.map(edit);
        if (records.some(Boolean)) onAfterEdit?.();
      }}
      onUnlink={commitOnBothSides}
    />
  );
}

function pairTokenRow(
  el: HTMLElement,
  rows: ResolvedProperty[],
  displayProperty: string,
  sideProperties: readonly [string, string],
): ResolvedProperty {
  const { sideRows, authoredValues, resolvedValues } = getPairValueState(el, rows, sideProperties);
  const valuesMatch = authoredValues[0] === authoredValues[1] && resolvedValues[0] === resolvedValues[1];
  const tokensMatch = sideRows[0]?.tokenName === sideRows[1]?.tokenName;
  const first = sideRows[0];

  return {
    ...(first ?? {}),
    property: displayProperty,
    tokenName: valuesMatch && tokensMatch ? first?.tokenName ?? null : null,
    declaredValue: authoredValues[0] ?? "",
    authored: authoredValues[0] ?? "",
    resolvedValue: resolvedValues[0] ?? authoredValues[0] ?? "",
    capability: first?.capability ?? "box-sides",
    confidence: valuesMatch ? first?.confidence ?? "unknown" : "unknown",
    evidence: first?.evidence ?? { reason: "paired physical side values" },
  };
}

function pairIsAsymmetric(
  el: HTMLElement,
  sideProperties: readonly [string, string],
): boolean {
  const resolvedValues = sideProperties.map((property) => getStateStyleValue(el, property));
  return resolvedValues[0] !== resolvedValues[1];
}

function getPairValueState(
  el: HTMLElement,
  rows: ResolvedProperty[],
  sideProperties: readonly [string, string],
): {
  sideRows: [ResolvedProperty | null, ResolvedProperty | null];
  authoredValues: [string, string];
  resolvedValues: [string, string];
} {
  const sideRows = sideProperties.map((property) => findTokenRow(rows, property)) as [ResolvedProperty | null, ResolvedProperty | null];
  const authoredValues = sideProperties.map((property, index) => {
    const row = sideRows[index];
    return row?.authored || row?.declaredValue || row?.resolvedValue || getStateStyleValue(el, property);
  }) as [string, string];
  const resolvedValues = sideProperties.map((property, index) => {
    const row = sideRows[index];
    return row?.resolvedValue || getStateStyleValue(el, property);
  }) as [string, string];
  return { sideRows, authoredValues, resolvedValues };
}
