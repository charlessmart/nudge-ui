import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { IconPlus } from "@tabler/icons-react";
import type { ResolvedProperty } from "../../css/model/index.ts";
import { findTokenRow, metadataFor } from "./rowLookup.ts";
import { TokenField, TokenValueField } from "../tokens/TokenField.tsx";
import type { TokenEntry } from "../../css/model/index.ts";
import type { SelectedElement } from "../selection/selectionStore.ts";
import { IconButton } from "../ui/IconButton.tsx";
import {
  SideValuesField,
  SIDE_NAMES,
  MarginSideIndicator,
  type SideValueAxis,
  type SideValuePairSlot,
  type SideValueSlot,
} from "../ui/SideValuesField.tsx";
import { setStyles, swapTokens } from "../tokens/editActions.ts";
import { completeCssValue } from "./completeCssValue.ts";
import { valuePolicyFor } from "./valuePolicy.ts";
import {
  projectInspectorValues,
  type InspectorAxisProjection,
  type InspectorFieldProjection,
  type InspectorSpacingProjection,
  projectInspectorValuesForSelection,
} from "../spacing/projection.ts";
import { getStateStyleValue } from "../shell/stateValue.ts";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

export interface SpacingBoxProps {
  element: SelectedElement;
  selection?: StyleSelection | null;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function SpacingBox(props: SpacingBoxProps): ReactElement {
  const { element, selection, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const allEntries = entries ?? [];
  const projection = selection
    ? projectInspectorValuesForSelection(selection)
    : projectInspectorValues(el, tokenRows);
  const showRelativeInset = selection
    ? selection.supportsRole("relative-position")
    : (() => {
      const value = getStateStyleValue(el, "position", "static").trim().toLowerCase();
      return value === "relative" || value === "sticky";
    })();
  const editTarget: EditTarget = selection?.target ?? el;

  return (
    <div className="editor" data-test="spacing-box">
      <div className="editor__title">Spacing</div>
      <div className="spacing">
        <SpacingField
          property="padding"
          projection={projection.spacing.padding}
          domElement={el}
          editTarget={editTarget}
          selection={selection}
          entries={allEntries}
          tokenRows={tokenRows}
          onAfterEdit={onAfterEdit}
        />
        <SpacingField
          property="margin"
          projection={projection.spacing.margin}
          domElement={el}
          editTarget={editTarget}
          selection={selection}
          entries={allEntries}
          tokenRows={tokenRows}
          onAfterEdit={onAfterEdit}
        />
        {showRelativeInset ? <SpacingField
          property="inset"
          projection={projection.spacing.inset}
          domElement={el}
          editTarget={editTarget}
          selection={selection}
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
  editTarget?: EditTarget;
  selection?: StyleSelection | null;
  entries: TokenEntry[];
  tokenRows: ResolvedProperty[];
  onAfterEdit?: () => void;
  showLabel?: boolean;
  showEmptyState?: boolean;
  suggestions?: ReadonlyArray<string>;
}

export function SpacingField({
  property,
  projection: spacingProjection,
  domElement: el,
  editTarget,
  selection,
  entries,
  tokenRows,
  onAfterEdit,
  showLabel = true,
  showEmptyState = true,
  suggestions,
}: SpacingFieldProps): ReactElement {
  const [fieldsAdded, setFieldsAdded] = useState(false);
  const pairDefinitions = [
    { axis: "horizontal", sideProperties: [sideProperty(property, "right"), sideProperty(property, "left")] as const },
    { axis: "vertical", sideProperties: [sideProperty(property, "top"), sideProperty(property, "bottom")] as const },
  ] as const;
  const sideSlots: SideValueSlot[] = SIDE_NAMES.map((side) => ({
    side,
    icon: property === "padding" ? <PaddingSideIndicator side={side} /> : <MarginSideIndicator side={side} />,
    control: (
      <TokenField
        property={sideProperty(property, side)}
        selection={selection}
        tokenRow={findTokenRow(tokenRows, sideProperty(property, side))}
        domElement={el}
        editTarget={editTarget}
        entries={entries}
        suggestions={suggestions}
        editMetadata={metadataFor(findTokenRow(tokenRows, sideProperty(property, side)))}
        onAfterEdit={onAfterEdit}
        chipVariant="small"
      />
    ),
  }));
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
        editTarget={editTarget}
        axisProjection={spacingProjection.axes[axis]}
        entries={entries}
        suggestions={suggestions}
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
      showLabel={showLabel}
      empty={showEmptyState && spacingIsEmpty && !fieldsAdded}
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
          <IconPlus size={16} aria-hidden="true" />
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
      <svg className="side-values__icon side-values__side-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" />
        <line x1="6.75" y1="7" x2="6.75" y2="17" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" />
      </svg>
    );
  }

  if (side === "right") {
    return (
      <svg className="side-values__icon side-values__side-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" />
        <line x1="17" y1="7" x2="17" y2="17" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" />
      </svg>
    );
  }

  if (side === "bottom") {
    return (
      <svg className="side-values__icon side-values__side-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="21" y="3" width="18" height="18" rx="2" transform="rotate(90 21 3)" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" />
        <line x1="17" y1="17" x2="7" y2="17" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg className="side-values__icon side-values__side-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="21" width="18" height="18" rx="2" transform="rotate(-90 3 21)" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" />
      <line x1="7" y1="7" x2="17" y2="7" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" />
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
      <svg className="side-values__icon side-values__axis-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" />
        <line x1="6.75" y1="7" x2="6.75" y2="17" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" />
        <line x1="17" y1="7" x2="17" y2="17" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" />
      </svg>
    );
  }

  if (property === "padding" && axis === "vertical") {
    return (
      <svg className="side-values__icon side-values__axis-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="21" y="3" width="18" height="18" rx="2" transform="rotate(90 21 3)" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" />
        <line x1="17" y1="6.75" x2="7" y2="6.75" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" />
        <line x1="17" y1="17" x2="7" y2="17" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" />
      </svg>
    );
  }

  if (property !== "padding" && axis === "horizontal") {
    return (
      <svg className="side-values__icon side-values__axis-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="6" y="5" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" />
        <line x1="2" y1="5" x2="2" y2="19" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" />
        <line x1="22" y1="5" x2="22" y2="19" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg className="side-values__icon side-values__axis-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="19" y="6" width="12" height="14" rx="2" transform="rotate(90 19 6)" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" />
      <line x1="19" y1="2" x2="5" y2="2" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" />
      <line x1="19" y1="22" x2="5" y2="22" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" />
    </svg>
  );
}

interface PairedTokenFieldProps {
  displayProperty: string;
  sideProperties: readonly [string, string];
  domElement: HTMLElement;
  editTarget?: EditTarget;
  axisProjection: InspectorAxisProjection;
  entries: TokenEntry[];
  suggestions?: ReadonlyArray<string>;
  onAfterEdit?: () => void;
  chipVariant?: "default" | "small";
}

function PairedTokenField({
  displayProperty,
  sideProperties,
  domElement: el,
  editTarget,
  axisProjection,
  entries,
  suggestions,
  onAfterEdit,
  chipVariant,
}: PairedTokenFieldProps): ReactElement {
  const row = pairTokenRow(displayProperty, axisProjection);
  const groupMixed = axisProjection.fields.some((field) => field.value === "Mixed");
  const valuesMatch = axisProjection.state === "shared" && !groupMixed;
  const expression = Boolean(row && (row.capability === "raw" || row.capability === "composite"
    || row.modifiers?.some((modifier) => modifier.kind === "alpha")));
  const calcAuthored = row?.authored ?? row?.declaredValue ?? "";
  const activeTokenName = !valuesMatch || expression || /\bcalc\s*\(/i.test(calcAuthored) ? null : row.tokenName;
  // Some browsers expose the used pixel size for horizontal auto margins.
  // Keep the authored keyword visible because replacing it with that transient
  // size would misrepresent the declaration and change the edit semantics.
  const committedValue = groupMixed
    ? "Mixed"
    : valuesMatch
    ? calcAuthored.trim().toLowerCase() === "auto"
      ? calcAuthored.trim()
      : expression ? row.authored || row.declaredValue || row.resolvedValue : row.resolvedValue
    : axisProjection.fields.map(fieldDisplayValue).join(", ");
  const resolvedValue = valuesMatch
    ? row.resolvedValue
    : axisProjection.fields.map((field) => field.value).join(", ");
  const currentToken = activeTokenName
    ? entries.find((entry) => entry.name === activeTokenName) ?? null
    : null;

  function commitAxisValue(value: string): void {
    const pair = splitAxisValue(value);
    const records = setStyles(
      editTarget ?? el,
      sideProperties.map((property, index) => ({
        property,
        value: pair?.[index] ?? value,
      })),
    );
    if (records.some(Boolean)) onAfterEdit?.();
  }

  return (
    <TokenValueField
      property={displayProperty}
      committedValue={committedValue}
      resolvedValue={resolvedValue}
      activeTokenName={activeTokenName}
      mixed={groupMixed}
      atRules={row.atRuleCandidates ?? row.atRules}
      entries={entries}
      suggestions={suggestions}
      chipVariant={chipVariant}
      formatRawValue={(value) => formatAxisValue(value, displayProperty)}
      onCommitRaw={commitAxisValue}
      onSelectToken={(chosen) => {
        const records = swapTokens(
          editTarget ?? el,
          sideProperties.map((property) => ({
            property,
            newToken: chosen,
            oldToken: activeTokenName ? currentToken : null,
          })),
        );
        if (records.some(Boolean)) onAfterEdit?.();
      }}
      onUnlink={commitAxisValue}
    />
  );
}

function fieldDisplayValue(field: InspectorFieldProjection): string {
  return field.authoredValue.trim() || field.value;
}

function splitAxisValue(value: string): readonly [string, string] | null {
  let depth = 0;
  let quote: "\"" | "'" | null = null;
  let separator = -1;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === "\"" || character === "'") quote = character;
    else if (character === "(" || character === "[") depth++;
    else if (character === ")" || character === "]") depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) {
      if (separator >= 0) return null;
      separator = index;
    }
  }
  if (separator < 0) return null;
  const first = value.slice(0, separator).trim();
  const second = value.slice(separator + 1).trim();
  return first && second ? [first, second] : null;
}

function formatAxisValue(value: string, property: string): string {
  const pair = splitAxisValue(value);
  const policy = valuePolicyFor(property);
  return pair
    ? pair.map((part) => completeCssValue(part, policy)).join(", ")
    : completeCssValue(value.trim(), policy);
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
