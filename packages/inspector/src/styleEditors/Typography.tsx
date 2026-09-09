import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  IconTextSize,
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconLayoutAlignMiddle,
  IconLayoutAlignBottom,
  IconLayoutAlignTop,
  IconBaseline,
  IconChevronDown,
  IconItalic,
  IconLetterSpacing,
  IconTypography,
} from "@tabler/icons-react";
import type { ResolvedProperty } from "@nudge-ui/css/model";
import { TokenField } from "../tokens/TokenField.tsx";
import type { TokenEntry } from "virtual:design-tokens";
import type { SelectedElement } from "../selectionStore.ts";
import { Select } from "../ui/Select.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { getStateStyleValue } from "../stateValue.ts";
import { setStyle, setStyles } from "./styleActions.ts";
import { AtRuleIndicator, useFieldAtRules } from "../ui/AtRuleContext.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import type { EditTarget } from "../editTarget.ts";
import type { StyleSelection } from "../styleSelection.ts";

function findTokenRow(rows: readonly ResolvedProperty[], prop: string): ResolvedProperty | null {
  return rows.find((r) => r.property === prop) ?? null;
}

export interface TypographyProps {
  element: SelectedElement;
  selection?: StyleSelection | null;
  entries?: TokenEntry[];
  tokenRows?: readonly ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function Typography(props: TypographyProps): ReactElement {
  const { element, selection, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const target: EditTarget = selection?.target ?? el;
  const targetElements = selection?.domElements ?? [el];
  const allEntries = entries ?? [];

  return (
    <div className="editor editor--typography" data-test="typography">
      <div className="editor__title-row">
        <div className="editor__title">Text</div>
      </div>

      <div className="typography">
        <TypographyTokenField
          property="font-family"
          label="Font family"
          icon={<IconItalic size={"var(--icon-size-small)"} stroke={1.35} aria-hidden="true" />}
          tokenRow={findTokenRow(tokenRows, "font-family")}
          selection={selection}
          domElement={el}
          editTarget={target}
          entries={allEntries}
          onAfterEdit={onAfterEdit}
        />

        <FontStyleField
          element={el}
          elements={targetElements}
          editTarget={target}
          fontStyleRow={findTokenRow(tokenRows, "font-style")}
          fontWeightRow={findTokenRow(tokenRows, "font-weight")}
          onAfterEdit={onAfterEdit}
        />

        <div className="typography__metrics" data-test="typography-metrics">
          <TypographyTokenField
            property="font-size"
            label="Font size"
            icon={<IconTextSize size={"var(--icon-size-small)"} stroke={1.55} aria-hidden="true" />}
            tokenRow={findTokenRow(tokenRows, "font-size")}
            selection={selection}
            domElement={el}
            editTarget={target}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
            chipVariant="small"
          />
          <TypographyTokenField
            property="line-height"
            label="Line height"
            icon={<IconBaseline size={"var(--icon-size-small)"} stroke={1.5} aria-hidden="true" />}
            tokenRow={findTokenRow(tokenRows, "line-height")}
            selection={selection}
            domElement={el}
            editTarget={target}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
            chipVariant="small"
          />
          <TypographyTokenField
            property="letter-spacing"
            label="Letter spacing"
            icon={<IconLetterSpacing size={"var(--icon-size-small)"} stroke={1.5} aria-hidden="true" />}
            tokenRow={findTokenRow(tokenRows, "letter-spacing")}
            selection={selection}
            domElement={el}
            editTarget={target}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
            chipVariant="small"
          />
        </div>

        <div className="typography__alignment" data-test="typography-alignment">
          <AlignmentField
            property="text-align"
            label="Horizontal alignment"
            element={el}
            elements={targetElements}
            editTarget={target}
            defaultValue="left"
            options={[
              { value: "left", label: "Align left", icon: <IconAlignLeft size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" /> },
              { value: "center", label: "Align center", icon: <IconAlignCenter size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" /> },
              { value: "right", label: "Align right", icon: <IconAlignRight size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" /> },
            ]}
            onAfterEdit={onAfterEdit}
          />
          <AlignmentField
            property="vertical-align"
            label="Vertical alignment"
            element={el}
            elements={targetElements}
            editTarget={target}
            defaultValue="baseline"
            options={[
              { value: "top", label: "Align top", icon: <IconLayoutAlignTop size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" /> },
              { value: "middle", label: "Align middle", icon: <IconLayoutAlignMiddle size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" /> },
              { value: "bottom", label: "Align bottom", icon: <IconLayoutAlignBottom size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" /> },
            ]}
            onAfterEdit={onAfterEdit}
          />
        </div>
      </div>
    </div>
  );
}

interface TypographyTokenFieldProps {
  property: string;
  label: string;
  icon: ReactElement;
  tokenRow: ResolvedProperty | null;
  selection?: StyleSelection | null;
  domElement: HTMLElement;
  editTarget: EditTarget;
  entries: TokenEntry[];
  onAfterEdit?: () => void;
  chipVariant?: "default" | "small";
}

function TypographyTokenField(props: TypographyTokenFieldProps): ReactElement {
  const { property, label, icon, tokenRow, selection, domElement, editTarget, entries, onAfterEdit, chipVariant } = props;
  const metric = property === "font-size" || property === "line-height" || property === "letter-spacing";
  const selectedProperty = selection && selection.elements.length > 1
    ? selection.getProperty(property)
    : null;
  const tokenName = selectedProperty
    ? selectedProperty.token.kind === "common" ? selectedProperty.token.name : null
    : tokenRow?.tokenName;
  const hasTokenChip = Boolean(tokenName
    && tokenRow?.capability !== "raw"
    && tokenRow?.capability !== "composite"
    && !tokenRow?.modifiers?.some((modifier) => modifier.kind === "alpha"));
  return (
    <ControlSurface className={`typography__field typography__field--${property}`}>
      <TokenField
        property={property}
        tokenRow={tokenRow}
        selection={selection}
        domElement={domElement}
        editTarget={editTarget}
        entries={entries}
        editMetadata={metadataFor(tokenRow)}
        leading={icon}
        trailing={metric || hasTokenChip ? undefined : <IconChevronDown size={17} stroke={1.8} aria-hidden="true" />}
        label={label}
        chipVariant={chipVariant}
        onAfterEdit={onAfterEdit}
      />
    </ControlSurface>
  );
}

interface FontStyleOption {
  value: string;
  label: string;
  weight: string;
  style: string;
}

const FONT_STYLE_OPTIONS: FontStyleOption[] = [
  { value: "300-normal", label: "Light", weight: "300", style: "normal" },
  { value: "400-normal", label: "Regular", weight: "400", style: "normal" },
  { value: "500-normal", label: "Medium", weight: "500", style: "normal" },
  { value: "600-normal", label: "Semibold", weight: "600", style: "normal" },
  { value: "700-normal", label: "Bold", weight: "700", style: "normal" },
  { value: "400-italic", label: "Italic", weight: "400", style: "italic" },
  { value: "700-italic", label: "Bold Italic", weight: "700", style: "italic" },
  { value: "400-oblique", label: "Oblique", weight: "400", style: "oblique" },
];

interface FontStyleFieldProps {
  element: HTMLElement;
  elements: readonly HTMLElement[];
  editTarget: EditTarget;
  fontStyleRow: ResolvedProperty | null;
  fontWeightRow: ResolvedProperty | null;
  onAfterEdit?: () => void;
}

function FontStyleField({ element, elements, editTarget, fontStyleRow, fontWeightRow, onAfterEdit }: FontStyleFieldProps): ReactElement {
  const fontStyleAtRules = useFieldAtRules("font-style");
  const fontWeightAtRules = useFieldAtRules("font-weight");
  const atRules = fontStyleRow?.atRuleCandidates ?? fontStyleRow?.atRules
    ?? fontWeightRow?.atRuleCandidates ?? fontWeightRow?.atRules
    ?? (fontStyleAtRules.length > 0 ? fontStyleAtRules : fontWeightAtRules);
  const readValue = () => readFontStyle(element);
  const values = elements.map(readFontStyle);
  const isMixed = values.some((value) => value.weight !== values[0]?.weight || value.style !== values[0]?.style);
  const [current, setCurrent] = useState(readValue);

  useEffect(() => {
    setCurrent(readValue());
  }, [element, elements]);

  const currentOption = FONT_STYLE_OPTIONS.find((option) => option.value === `${current.weight}-${current.style}`);
  const currentKey = currentOption?.value ?? `${current.weight}-${current.style}`;
  const currentLabel = isMixed ? "Mixed" : currentOption?.label ?? formatCustomFontStyle(current.weight, current.style);
  const options = isMixed
    ? [{ value: "mixed", label: "Mixed", disabled: true }, ...FONT_STYLE_OPTIONS]
    : currentOption
      ? FONT_STYLE_OPTIONS
      : [...FONT_STYLE_OPTIONS, { value: currentKey, label: currentLabel, ...current }];

  function handleChange(value: string): void {
    const option = options.find((candidate) => candidate.value === value);
    if (!option || option.value === "mixed" || !("weight" in option) || !("style" in option)) return;
    setCurrent({ weight: option.weight, style: option.style });
    setStyles(editTarget, [
      { property: "font-style", value: option.style, metadata: metadataFor(fontStyleRow ?? fontWeightRow) },
      { property: "font-weight", value: option.weight, metadata: metadataFor(fontWeightRow ?? fontStyleRow) },
    ]);
    onAfterEdit?.();
  }

  return (
    <ControlSurface
      className="typography__field typography__field--font-style"
      data-test="typography-field"
      data-property="font-style"
      aria-label="Font style"
      title="Font style"
    >
      <span className="typography__field-icon" aria-hidden="true">
        <IconTypography size={"var(--icon-size-small)"} stroke={1.45} />
      </span>
      <Select
        appearance="embedded"
        value={isMixed ? "mixed" : currentKey}
        options={options.map(({ value, label }) => ({ value, label }))}
        onValueChange={handleChange}
        data-test="font-style-field"
      />
      <AtRuleIndicator atRules={atRules} />
    </ControlSurface>
  );
}

function readFontStyle(element: HTMLElement) {
  return {
    weight: normalizeFontWeight(getStateStyleValue(element, "font-weight", "400") || "400"),
    style: getStateStyleValue(element, "font-style", "normal") || "normal",
  };
}

function normalizeFontWeight(value: string): string {
  if (value === "normal") return "400";
  if (value === "bold") return "700";
  return value;
}

function formatCustomFontStyle(weight: string, style: string): string {
  const italic = style === "italic" || style.startsWith("oblique");
  const weightLabel = weight === "400" ? "Regular" : weight;
  return italic ? `${weightLabel} ${style}` : weightLabel;
}

interface AlignmentOption {
  value: string;
  label: string;
  icon: ReactElement;
}

interface AlignmentFieldProps {
  property: string;
  label: string;
  element: HTMLElement;
  elements: readonly HTMLElement[];
  editTarget: EditTarget;
  defaultValue: string;
  options: AlignmentOption[];
  onAfterEdit?: () => void;
}

function AlignmentField({ property, label, element, elements, editTarget, defaultValue, options, onAfterEdit }: AlignmentFieldProps): ReactElement {
  const atRules = useFieldAtRules(property);
  const readValues = () => elements.map((target) => getStateStyleValue(target, property, defaultValue));
  const initialValues = readValues();
  const isMixed = initialValues.some((value) => value !== initialValues[0]);
  const [initialValue] = useState(() => getStateStyleValue(element, property, defaultValue));
  const [current, setCurrent] = useState<string | null>(() => isMixed ? null : normalizeAlignment(property, initialValue));

  useEffect(() => {
    const next = getStateStyleValue(element, property, defaultValue);
    const values = readValues();
    setCurrent(values.some((value) => value !== values[0]) ? null : normalizeAlignment(property, next));
  }, [defaultValue, element, elements, property]);

  function handleChange(value: string): void {
    setCurrent(value);
    setStyle(editTarget, property, value);
    onAfterEdit?.();
  }

  return (
    <div className="typography__alignment-field">
      {isMixed || current === null && elements.length > 1 ? (
        <span className="typography__mixed" data-test={`typography-mixed-${property}`}>Mixed</span>
      ) : null}
      <SegmentedControl
        value={current}
        aria-label={label}
        data-property={property}
        options={options.map((option) => ({
          value: option.value,
          label: option.label,
          icon: option.icon,
          testId: `typography-align-${property}-${option.value}`,
        }))}
        onChange={handleChange}
      />
      <AtRuleIndicator atRules={atRules} />
    </div>
  );
}

function normalizeAlignment(property: string, value: string): string {
  if (property !== "text-align") return value;
  if (value === "start") return "left";
  if (value === "end") return "right";
  return value;
}

function metadataFor(row: ResolvedProperty | null | undefined) {
  return row?.sourceProperty
    ? { sourceProperty: row.sourceProperty, sourceAuthoredValue: row.authored ?? row.declaredValue }
    : undefined;
}
