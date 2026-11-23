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
import type { ResolvedProperty } from "../../css/model/index.ts";
import { findTokenRow, metadataFor } from "./rowLookup.ts";
import { isExpressionRow } from "./fieldValue.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { TokenEntry } from "../../css/model/index.ts";
import type { SelectedElement } from "../selection/selectionStore.ts";
import { ToggleButton } from "../ui/ToggleButton.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { getStateStyleValue } from "../shell/stateValue.ts";
import { setStyle } from "../tokens/editActions.ts";
import { AtRuleIndicator, useFieldAtRules } from "../ui/AtRuleContext.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { InlineStyleBlockedTooltip } from "../ui/InlineStyleWarning.tsx";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
import { inlineBlockedBy } from "./inlineAuthored.ts";

export interface TypographyProps {
  element: SelectedElement;
  selection?: StyleSelection | null;
  entries?: TokenEntry[];
  tokenRows?: readonly ResolvedProperty[];
}

export function Typography(props: TypographyProps): ReactElement {
  const { element, selection, entries, tokenRows = [] } = props;
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
        />

        <div className="typography__weight" data-test="typography-weight">
          <TypographyTokenField
            property="font-weight"
            label="Font weight"
            icon={<IconTypography size={"var(--icon-size-small)"} stroke={1.45} aria-hidden="true" />}
            tokenRow={findTokenRow(tokenRows, "font-weight")}
            selection={selection}
            domElement={el}
            editTarget={target}
            entries={allEntries}
            suggestions={FONT_WEIGHT_SUGGESTIONS}
          />
          <ItalicToggle
            elements={targetElements}
            editTarget={target}
            fontStyleRow={findTokenRow(tokenRows, "font-style")}
          />
        </div>

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
  suggestions?: ReadonlyArray<string>;
}

function TypographyTokenField(props: TypographyTokenFieldProps): ReactElement {
  const { property, label, icon, tokenRow, selection, domElement, editTarget, entries, suggestions } = props;
  const metric = property === "font-size" || property === "line-height" || property === "letter-spacing" || property === "font-weight";
  const selectedProperty = selection && selection.elements.length > 1
    ? selection.getProperty(property)
    : null;
  const tokenName = selectedProperty
    ? selectedProperty.token.kind === "common" ? selectedProperty.token.name : null
    : tokenRow?.tokenName;
  const hasTokenChip = Boolean(tokenName && !isExpressionRow(tokenRow));
  return (
    <ControlSurface className={`typography__field typography__field--${property}`}>
      <TokenField
        property={property}
        tokenRow={tokenRow}
        selection={selection}
        domElement={domElement}
        editTarget={editTarget}
        entries={entries}
        suggestions={suggestions}
        editMetadata={metadataFor(tokenRow)}
        leading={icon}
        trailing={metric || hasTokenChip ? undefined : <IconChevronDown size={17} stroke={1.8} aria-hidden="true" />}
        label={label}
      />
    </ControlSurface>
  );
}

const FONT_WEIGHT_SUGGESTIONS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"];

interface ItalicToggleProps {
  elements: readonly HTMLElement[];
  editTarget: EditTarget;
  fontStyleRow: ResolvedProperty | null;
}

function ItalicToggle({ elements, editTarget, fontStyleRow }: ItalicToggleProps): ReactElement {
  const fieldAtRules = useFieldAtRules("font-style");
  const atRules = fontStyleRow?.atRuleCandidates ?? fontStyleRow?.atRules ?? fieldAtRules;
  const blockedBy = inlineBlockedBy(elements, "font-style");
  const readSlants = () => elements.map((target) => isSlanted(getStateStyleValue(target, "font-style", "normal")));
  const slants = readSlants();
  const isMixed = slants.some((slanted) => slanted !== slants[0]);
  const [italic, setItalic] = useState(() => slants.every(Boolean));

  // The row is resolved again whenever a change lands (an undo, another field writing `font-style`), and a new
  // interaction state remounts the editor, so re-reading on a new row keeps the toggle on what the page shows.
  useEffect(() => {
    setItalic(readSlants().every(Boolean));
  }, [elements, fontStyleRow]);

  function handleChange(pressed: boolean): void {
    if (blockedBy) return;
    setItalic(pressed);
    setStyle(editTarget, "font-style", pressed ? "italic" : "normal", metadataFor(fontStyleRow));
  }

  return (
    <div className="typography__style-toggle">
      {isMixed ? <span className="typography__mixed" data-test="typography-mixed-font-style">Mixed</span> : null}
      <InlineStyleBlockedTooltip blockedBy={blockedBy}>
        <ToggleButton
          variant="quiet"
          label="Italic"
          data-test="font-style-italic"
          data-property="font-style"
          data-mixed={isMixed ? "true" : undefined}
          pressed={italic && !isMixed}
          disabled={blockedBy !== null}
          onPressedChange={handleChange}
        >
          <IconItalic size={"var(--icon-size-small)"} stroke={1.5} aria-hidden="true" />
        </ToggleButton>
      </InlineStyleBlockedTooltip>
      <AtRuleIndicator atRules={atRules} />
    </div>
  );
}

function isSlanted(style: string): boolean {
  return style === "italic" || style.startsWith("oblique");
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
}

function AlignmentField({ property, label, element, elements, editTarget, defaultValue, options }: AlignmentFieldProps): ReactElement {
  const atRules = useFieldAtRules(property);
  const blockedBy = inlineBlockedBy(elements, property);
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
    if (blockedBy) return;
    setCurrent(value);
    setStyle(editTarget, property, value);
  }

  return (
    <div className="typography__alignment-field">
      {isMixed || current === null && elements.length > 1 ? (
        <span className="typography__mixed" data-test={`typography-mixed-${property}`}>Mixed</span>
      ) : null}
      <InlineStyleBlockedTooltip blockedBy={blockedBy}>
        <SegmentedControl
          value={current}
          aria-label={label}
          data-property={property}
          disabled={blockedBy !== null}
          options={options.map((option) => ({
            value: option.value,
            label: option.label,
            icon: option.icon,
            testId: `typography-align-${property}-${option.value}`,
          }))}
          onChange={handleChange}
        />
      </InlineStyleBlockedTooltip>
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
