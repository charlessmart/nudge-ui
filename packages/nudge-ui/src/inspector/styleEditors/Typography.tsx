import type { ReactElement } from "react";
import { useState } from "react";
import {
  IconTextSize,
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconLayoutAlignMiddle,
  IconLayoutAlignBottom,
  IconLayoutAlignTop,
  IconChevronDown,
  IconItalic,
  IconTypography,
} from "@tabler/icons-react";
import type { ResolvedProperty } from "../../css/model/index.ts";
import { findTokenRow, metadataFor } from "./rowLookup.ts";
import { IconLetterSpacing, IconLineHeight } from "./TypographyIcons.tsx";
import { TypographyOptions } from "./TypographyOptions.tsx";
import { TextSegmentedField } from "./TextSegmentedField.tsx";
import { isExpressionRow } from "./fieldValue.ts";
import { TokenField, type DisplayFormat } from "../tokens/TokenField.tsx";
import { FONT_WEIGHT_NAME_SUGGESTIONS, fontWeightName, fontWeightValue } from "./fontWeightNames.ts";
import type { TokenEntry } from "../../css/model/index.ts";
import type { SelectedElement } from "../selection/selectionStore.ts";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

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
  const revision = useRevision(tokenRows);

  return (
    <div className="editor editor--typography" data-test="typography">
      <div className="editor__title-row">
        <div className="editor__title">Text</div>
      </div>

      <div className="typography">
        <div className="typography__row" data-test="typography-family">
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
        </div>

        {/* Size and weight, then line height and spacing; the third column keeps room for an icon button. */}
        <div className="typography__row" data-test="typography-size-weight">
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
            property="font-weight"
            label="Font weight"
            icon={<IconTypography size={"var(--icon-size-small)"} stroke={1.45} aria-hidden="true" />}
            tokenRow={findTokenRow(tokenRows, "font-weight")}
            selection={selection}
            domElement={el}
            editTarget={target}
            entries={allEntries}
            suggestions={FONT_WEIGHT_NAME_SUGGESTIONS}
            displayFormat={FONT_WEIGHT_DISPLAY}
          />
        </div>

        <div className="typography__row" data-test="typography-spacing">
          <TypographyTokenField
            property="line-height"
            label="Line height"
            icon={<IconLineHeight />}
            tokenRow={findTokenRow(tokenRows, "line-height")}
            selection={selection}
            domElement={el}
            editTarget={target}
            entries={allEntries}
          />
          <TypographyTokenField
            property="letter-spacing"
            label="Letter spacing"
            icon={<IconLetterSpacing />}
            tokenRow={findTokenRow(tokenRows, "letter-spacing")}
            selection={selection}
            domElement={el}
            editTarget={target}
            entries={allEntries}
          />
        </div>

        <div className="typography__alignment" data-test="typography-alignment">
          <TextSegmentedField
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
          <TextSegmentedField
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
          <TypographyOptions
            domElement={el}
            editTarget={target}
            selection={selection}
            tokenRows={tokenRows}
            revision={revision}
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
  displayFormat?: DisplayFormat;
}

function TypographyTokenField(props: TypographyTokenFieldProps): ReactElement {
  const { property, label, icon, tokenRow, selection, domElement, editTarget, entries, suggestions, displayFormat } = props;
  // Weight has named suggestions to open, so it keeps the chevron the other metrics leave out.
  const metric = property === "font-size" || property === "line-height" || property === "letter-spacing";
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
        displayFormat={displayFormat}
        editMetadata={metadataFor(tokenRow)}
        leading={icon}
        trailing={metric || hasTokenChip ? undefined : <IconChevronDown size={17} stroke={1.8} aria-hidden="true" />}
        label={label}
      />
    </ControlSurface>
  );
}

const FONT_WEIGHT_DISPLAY: DisplayFormat = { toDisplay: fontWeightName, toCss: fontWeightValue };

/** Counts the times the rows are resolved again, which a change anywhere (an undo, another field's write) causes. */
function useRevision(rows: readonly ResolvedProperty[]): number {
  const [seen, setSeen] = useState({ rows, revision: 0 });
  if (seen.rows !== rows) {
    // Adjusting state while rendering, as React documents for values derived from a changed prop.
    const next = { rows, revision: seen.revision + 1 };
    setSeen(next);
    return next.revision;
  }
  return seen.revision;
}
