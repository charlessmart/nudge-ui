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
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "@nudge-ui/css/model";
import { TokenField } from "../tokens/TokenField.tsx";
import type { SelectedElement } from "../selectionStore.ts";
import { setStyle } from "./styleActions.ts";
import { SideControls, SIDE_NAMES } from "../ui/SideValuesField.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { getNudgeUiTokenEntries } from "../runtimeConfig.ts";
import { completeCssValue } from "./completeCssValue.ts";
import { valuePolicyFor } from "./valuePolicy.ts";

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

function findTokenRow(rows: ResolvedProperty[], prop: string): ResolvedProperty | null {
  return rows.find((r) => r.property === prop) ?? null;
}

function cornerAuthoredSignature(rows: ResolvedProperty[], corner: string): string {
  const row = findTokenRow(rows, corner);
  return `${row?.authored ?? row?.declaredValue ?? ""}|${row?.tokenName ?? ""}`;
}

function cornersAreLinked(rows: ResolvedProperty[]): boolean {
  const signatures = BORDER_RADIUS_CORNERS.map((corner) => cornerAuthoredSignature(rows, corner));
  return new Set(signatures).size === 1;
}

function metadataFor(row: ResolvedProperty | null | undefined) {
  return row?.sourceProperty
    ? { sourceProperty: row.sourceProperty, sourceAuthoredValue: row.authored ?? row.declaredValue }
    : undefined;
}

function linkAllCorners(
  el: HTMLElement,
  rows: ResolvedProperty[],
  onAfterEdit?: () => void,
): void {
  const firstRow = findTokenRow(rows, BORDER_RADIUS_CORNERS[0]);
  const sharedValue = firstRow?.authored ?? firstRow?.declaredValue ?? "";
  if (!sharedValue) return;
  setStyle(el, "border-radius", sharedValue);
  onAfterEdit?.();
}

export interface BorderRadiusEditorProps {
  element: SelectedElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
  embedded?: boolean;
}

export function BorderRadiusEditor(props: BorderRadiusEditorProps): ReactElement {
  const { element, entries, tokenRows = [], onAfterEdit, embedded = false } = props;
  const el = element.domElement;
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const dataLinked = cornersAreLinked(tokenRows);

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
    linkAllCorners(el, tokenRows, onAfterEdit);
  }

  const cornerSides = BORDER_RADIUS_CORNERS.map((corner, index) => ({
    side: SIDE_NAMES[index]!,
    icon: (() => {
      const Icon = BORDER_RADIUS_ICONS[index]!;
      return <Icon className="side-values__icon side-values__side-icon" size={16} stroke={1.8} aria-hidden="true" />;
    })(),
    control: (
      <TokenField
        property={corner}
        tokenRow={findTokenRow(tokenRows, corner)}
        domElement={el}
        entries={allEntries}
        editMetadata={metadataFor(findTokenRow(tokenRows, corner))}
        onAfterEdit={onAfterEdit}
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
        tokenRow={mixed ? null : borderRadiusRow}
        initialValue={mixed ? "Mix" : undefined}
        displayValue={mixed ? "Mix" : undefined}
        domElement={el}
        entries={allEntries}
        editMetadata={metadataFor(borderRadiusRow)}
        formatRawValue={(value) => mixed && value.trim().toLowerCase() === "mix"
          ? ""
          : completeCssValue(value.trim(), valuePolicyFor("border-radius"))}
        onAfterEdit={onAfterEdit}
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
      <IconBorderCorners size={"var(--icon-size-small)"} stroke={1.8} aria-hidden="true" />
    </ToggleButton>
  );

  const individuals = !isLinked ? (
    <div className="border-radius-editor__individuals">
      <SideControls label="Border Radius Corners" sides={cornerSides} />
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
