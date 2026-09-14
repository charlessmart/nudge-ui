import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import {
  IconBorderCorners,
  IconRadiusBottomLeft,
  IconRadiusBottomRight,
  IconRadiusTopLeft,
  IconRadiusTopRight,
} from "@tabler/icons-react";
import { ToggleButton } from "../ui/ToggleButton.tsx";
import type { TokenEntry } from "../../css/model/index.ts";
import type { ResolvedProperty } from "../../css/model/index.ts";
import { findTokenRow, metadataFor } from "./rowLookup.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { SelectedElement } from "../selection/selectionStore.ts";
import { setStyle } from "../tokens/editActions.ts";
import { SideControls, SIDE_NAMES } from "../ui/SideValuesField.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { getNudgeUiTokenEntries } from "../runtime/runtimeConfig.ts";
import { completeCssValue } from "./completeCssValue.ts";
import { valuePolicyFor } from "./valuePolicy.ts";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

const BORDER_RADIUS_CORNERS = [
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
] as const;

const BORDER_RADIUS_ICONS = [
  IconRadiusTopLeft,
  IconRadiusTopRight,
  IconRadiusBottomRight,
  IconRadiusBottomLeft,
] as const;

const BORDER_RADIUS_LABELS = ["Top Left", "Top Right", "Bottom Right", "Bottom Left"] as const;

function cornerAuthoredSignature(rows: ResolvedProperty[], corner: string): string {
  const row = findTokenRow(rows, corner);
  return `${row?.authored ?? row?.declaredValue ?? ""}|${row?.tokenName ?? ""}`;
}

function cornersAreLinked(rows: ResolvedProperty[]): boolean {
  const signatures = BORDER_RADIUS_CORNERS.map((corner) => cornerAuthoredSignature(rows, corner));
  return new Set(signatures).size === 1;
}

function linkAllCorners(
  target: EditTarget,
  rows: ResolvedProperty[],
  selection: StyleSelection | null | undefined,
  onAfterEdit?: () => void,
): void {
  const firstRow = findTokenRow(rows, BORDER_RADIUS_CORNERS[0]);
  const selectedValue = selection && selection.elements.length > 1
    ? selection.getProperty(BORDER_RADIUS_CORNERS[0])?.value
    : null;
  const sharedValue = (selectedValue?.kind === "common" ? selectedValue.value : undefined)
    ?? firstRow?.authored
    ?? firstRow?.declaredValue
    ?? "";
  if (!sharedValue) return;
  setStyle(target, "border-radius", sharedValue);
  onAfterEdit?.();
}

export interface BorderRadiusEditorProps {
  element: SelectedElement;
  selection?: StyleSelection | null;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
  embedded?: boolean;
}

export function BorderRadiusEditor(props: BorderRadiusEditorProps): ReactElement {
  const { element, selection, entries, tokenRows = [], onAfterEdit, embedded = false } = props;
  const el = element.domElement;
  const editTarget: EditTarget = selection?.target ?? el;
  const isGroup = Boolean(selection && selection.elements.length > 1);
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const dataLinked = !isGroup && cornersAreLinked(tokenRows);

  const [userUnlinked, setUserUnlinked] = useState(false);
  const [userLinked, setUserLinked] = useState(false);

  useEffect(() => {
    setUserUnlinked(false);
    setUserLinked(false);
  }, [el]);

  useEffect(() => {
    if (dataLinked) setUserLinked(false);
    else setUserUnlinked(false);
  }, [dataLinked]);

  const isLinked = dataLinked ? !userUnlinked : userLinked;

  function handleExpand(): void {
    setUserUnlinked(true);
    setUserLinked(false);
  }

  function handleCollapse(): void {
    setUserLinked(true);
    setUserUnlinked(false);
    linkAllCorners(editTarget, tokenRows, selection, onAfterEdit);
  }

  const cornerSides = BORDER_RADIUS_CORNERS.map((corner, index) => ({
    side: SIDE_NAMES[index]!,
    sideLabel: BORDER_RADIUS_LABELS[index]!,
    icon: (() => {
      const Icon = BORDER_RADIUS_ICONS[index]!;
      return <Icon className="side-values__icon side-values__side-icon" size={16} aria-hidden="true" />;
    })(),
    control: (
      <TokenField
        property={corner}
        selection={selection}
        tokenRow={findTokenRow(tokenRows, corner)}
        domElement={el}
        editTarget={editTarget}
        entries={allEntries}
        editMetadata={metadataFor(findTokenRow(tokenRows, corner))}
        onAfterEdit={onAfterEdit}
        chipVariant="small"
      />
    ),
  }));

  const linkedTokenRow = (): ResolvedProperty | null => {
    const first = findTokenRow(tokenRows, BORDER_RADIUS_CORNERS[0]);
    if (!first) return null;
    return { ...first, property: "border-radius" };
  };

  const borderRadiusRow = findTokenRow(tokenRows, "border-radius") ?? linkedTokenRow();
  const mixed = !dataLinked;

  const groupedControl = (
    <ControlSurface>
      <TokenField
        property="border-radius"
        selection={selection}
        tokenRow={mixed ? null : borderRadiusRow}
        initialValue={mixed ? "Mix" : undefined}
        displayValue={mixed ? "Mix" : undefined}
        domElement={el}
        editTarget={editTarget}
        entries={allEntries}
        editMetadata={metadataFor(borderRadiusRow)}
        mixed={mixed}
        formatRawValue={(value) => mixed && value.trim().toLowerCase() === "mix"
          ? ""
          : completeCssValue(value.trim(), valuePolicyFor("border-radius"))}
        onAfterEdit={onAfterEdit}
        chipVariant="small"
      />
    </ControlSurface>
  );

  const toggleButton = (
    <ToggleButton
      className={embedded ? "border-radius-editor__toggle" : undefined}
      variant="quiet"
      size="default"
      data-test={isLinked ? "border-radius-expand" : "border-radius-collapse"}
      label={isLinked ? "Edit Individual Corners" : "Link All Corners"}
      title={isLinked ? "Edit Individual Corners" : "Link All Corners"}
      pressed={!isLinked}
      onPressedChange={(pressed) => {
        if (pressed) handleExpand();
        else handleCollapse();
      }}
    >
      <IconBorderCorners size={"var(--icon-size-small)"} aria-hidden="true" />
    </ToggleButton>
  );

  const individuals = !isLinked ? (
    <div className="border-radius-editor__individuals">
      <SideControls label="Border Radius Corners" layout="corners" sides={cornerSides} />
    </div>
  ) : null;

  if (embedded) {
    return (
      <div
        className="border-radius-editor border-radius-editor--embedded"
        data-test="border-radius-editor"
        data-expanded={!isLinked ? "true" : "false"}
      >
        <div className="border-radius-editor__main">
          <div className="appearance__field-header">
            <div className="appearance__field-label">Corner Radius</div>
          </div>
          {groupedControl}
        </div>
        {toggleButton}
        {individuals}
      </div>
    );
  }

  return (
    <div
      className="editor border-radius-editor"
      data-test="border-radius-editor"
      data-expanded={!isLinked ? "true" : "false"}
    >
      <div className="border-radius-editor__main">
        <div className="editor__title-row">
          <div className="editor__title">Border Radius</div>
        </div>
        <div className="border-radius__grouped-row">
          {groupedControl}
          {toggleButton}
        </div>
      </div>
      {individuals}
    </div>
  );
}
