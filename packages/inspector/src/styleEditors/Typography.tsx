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
import type { ResolvedProperty } from "../tokens/resolution.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { TokenEntry } from "virtual:design-tokens";
import type { SelectedElement } from "../selectionStore.ts";
import { Select } from "../ui/Select.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { getStateStyleValue } from "../stateValue.ts";
import { setStyle } from "./styleActions.ts";
import { AtRuleIndicator, useFieldAtRules } from "../ui/AtRuleContext.tsx";

function findTokenRow(rows: ResolvedProperty[], prop: string): ResolvedProperty | null {
  return rows.find((r) => r.property === prop) ?? null;
}

export interface TypographyProps {
  element: SelectedElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function Typography(props: TypographyProps): ReactElement {
  const { element, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const allEntries = entries ?? [];

  return (
    <div className="dt-editor dt-editor--typography" data-test="typography">
      <div className="dt-editor__title-row">
        <div className="dt-editor__title">Text</div>
      </div>

      <div className="dt-typography">
        <TypographyTokenField
          property="font-family"
          label="Font family"
          icon={<IconItalic size={"var(--dt-icon-size-small)"} stroke={1.35} aria-hidden="true" />}
          tokenRow={findTokenRow(tokenRows, "font-family")}
          domElement={el}
          entries={allEntries}
          onAfterEdit={onAfterEdit}
        />

        <FontStyleField
          element={el}
          fontStyleRow={findTokenRow(tokenRows, "font-style")}
          fontWeightRow={findTokenRow(tokenRows, "font-weight")}
          onAfterEdit={onAfterEdit}
        />

        <div className="dt-typography__metrics" data-test="typography-metrics">
          <TypographyTokenField
            property="font-size"
            label="Font size"
            icon={<IconTextSize size={"var(--dt-icon-size-small)"} stroke={1.55} aria-hidden="true" />}
            tokenRow={findTokenRow(tokenRows, "font-size")}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
            chipVariant="small"
          />
          <TypographyTokenField
            property="line-height"
            label="Line height"
            icon={<IconBaseline size={"var(--dt-icon-size-small)"} stroke={1.5} aria-hidden="true" />}
            tokenRow={findTokenRow(tokenRows, "line-height")}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
            chipVariant="small"
          />
          <TypographyTokenField
            property="letter-spacing"
            label="Letter spacing"
            icon={<IconLetterSpacing size={"var(--dt-icon-size-small)"} stroke={1.5} aria-hidden="true" />}
            tokenRow={findTokenRow(tokenRows, "letter-spacing")}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
            chipVariant="small"
          />
        </div>

        <div className="dt-typography__alignment" data-test="typography-alignment">
          <AlignmentField
            property="text-align"
            label="Horizontal alignment"
            element={el}
            defaultValue="left"
            options={[
              { value: "left", label: "Align left", icon: <IconAlignLeft size={"var(--dt-icon-size-small)"} stroke={1.6} aria-hidden="true" /> },
              { value: "center", label: "Align center", icon: <IconAlignCenter size={"var(--dt-icon-size-small)"} stroke={1.6} aria-hidden="true" /> },
              { value: "right", label: "Align right", icon: <IconAlignRight size={"var(--dt-icon-size-small)"} stroke={1.6} aria-hidden="true" /> },
            ]}
            onAfterEdit={onAfterEdit}
          />
          <AlignmentField
            property="vertical-align"
            label="Vertical alignment"
            element={el}
            defaultValue="baseline"
            options={[
              { value: "top", label: "Align top", icon: <IconLayoutAlignTop size={"var(--dt-icon-size-small)"} stroke={1.6} aria-hidden="true" /> },
              { value: "middle", label: "Align middle", icon: <IconLayoutAlignMiddle size={"var(--dt-icon-size-small)"} stroke={1.6} aria-hidden="true" /> },
              { value: "bottom", label: "Align bottom", icon: <IconLayoutAlignBottom size={"var(--dt-icon-size-small)"} stroke={1.6} aria-hidden="true" /> },
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
  domElement: HTMLElement;
  entries: TokenEntry[];
  onAfterEdit?: () => void;
  chipVariant?: "default" | "small";
}

function TypographyTokenField(props: TypographyTokenFieldProps): ReactElement {
  const { property, label, icon, tokenRow, domElement, entries, onAfterEdit, chipVariant } = props;
  const metric = property === "font-size" || property === "line-height" || property === "letter-spacing";
  const hasTokenChip = Boolean(tokenRow?.tokenName
    && tokenRow.capability !== "raw"
    && tokenRow.capability !== "composite"
    && !tokenRow.modifiers?.some((modifier) => modifier.kind === "alpha"));
  return (
    <TokenField
      className={`dt-typography__field dt-typography__field--${property}`}
      property={property}
      tokenRow={tokenRow}
      domElement={domElement}
      entries={entries}
      editMetadata={metadataFor(tokenRow)}
      leading={icon}
      trailing={metric || hasTokenChip ? undefined : <IconChevronDown size={17} stroke={1.8} aria-hidden="true" />}
      label={label}
      chipVariant={chipVariant}
      onAfterEdit={onAfterEdit}
    />
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
  fontStyleRow: ResolvedProperty | null;
  fontWeightRow: ResolvedProperty | null;
  onAfterEdit?: () => void;
}

function FontStyleField({ element, fontStyleRow, fontWeightRow, onAfterEdit }: FontStyleFieldProps): ReactElement {
  const fontStyleAtRules = useFieldAtRules("font-style");
  const fontWeightAtRules = useFieldAtRules("font-weight");
  const atRules = fontStyleRow?.atRules ?? fontWeightRow?.atRules
    ?? (fontStyleAtRules.length > 0 ? fontStyleAtRules : fontWeightAtRules);
  const readValue = () => readFontStyle(element);
  const [current, setCurrent] = useState(readValue);

  useEffect(() => {
    setCurrent(readValue());
  }, [element]);

  const currentOption = FONT_STYLE_OPTIONS.find((option) => option.value === `${current.weight}-${current.style}`);
  const currentKey = currentOption?.value ?? `${current.weight}-${current.style}`;
  const currentLabel = currentOption?.label ?? formatCustomFontStyle(current.weight, current.style);
  const options = currentOption
    ? FONT_STYLE_OPTIONS
    : [...FONT_STYLE_OPTIONS, { value: currentKey, label: currentLabel, ...current }];

  function handleChange(value: string): void {
    const option = options.find((candidate) => candidate.value === value);
    if (!option) return;
    setCurrent({ weight: option.weight, style: option.style });
    setStyle(element, "font-style", option.style, metadataFor(fontStyleRow ?? fontWeightRow));
    setStyle(element, "font-weight", option.weight, metadataFor(fontWeightRow ?? fontStyleRow));
    onAfterEdit?.();
  }

  return (
    <div
      className="dt-typography__field dt-typography__field--font-style"
      data-test="typography-field"
      data-property="font-style"
      aria-label="Font style"
      title="Font style"
    >
      <span className="dt-typography__field-icon" aria-hidden="true">
        <IconTypography size={"var(--dt-icon-size-small)"} stroke={1.45} />
      </span>
      <Select
        value={currentKey}
        options={options.map(({ value, label }) => ({ value, label }))}
        onValueChange={handleChange}
        data-test="font-style-field"
      />
      <AtRuleIndicator atRules={atRules} />
    </div>
  );
}

function readFontStyle(element: HTMLElement): { weight: string; style: string } {
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
  defaultValue: string;
  options: AlignmentOption[];
  onAfterEdit?: () => void;
}

function AlignmentField({ property, label, element, defaultValue, options, onAfterEdit }: AlignmentFieldProps): ReactElement {
  const atRules = useFieldAtRules(property);
  const [current, setCurrent] = useState(() => normalizeAlignment(property, getStateStyleValue(element, property, defaultValue)));

  useEffect(() => {
    setCurrent(normalizeAlignment(property, getStateStyleValue(element, property, defaultValue)));
  }, [defaultValue, element, property]);

  function handleChange(value: string): void {
    setCurrent(value);
    setStyle(element, property, value);
    onAfterEdit?.();
  }

  return (
    <div className="dt-typography__alignment-field">
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
