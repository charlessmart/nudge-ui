import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { IconBorderCorners } from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton.tsx";
import type { TokenEntry } from "virtual:design-tokens";
import { tokens } from "virtual:design-tokens";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { SelectedElement } from "../selectionStore.ts";
import { setStyle } from "./styleActions.ts";
import { SideControls, SIDE_NAMES } from "../ui/SideValuesField.tsx";

const BORDER_RADIUS_CORNERS = [
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
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
}

export function BorderRadiusEditor(props: BorderRadiusEditorProps): ReactElement {
  const { element, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const allEntries = entries ?? tokens;
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

  return (
    <div className="dt-editor dt-border-radius-editor" data-test="border-radius-editor">
      <div className="dt-editor__title-row">
        <div className="dt-editor__title">Border Radius</div>
        <IconButton
          variant="quiet"
          size="default"
          data-test={isLinked ? "border-radius-expand" : "border-radius-collapse"}
          label={isLinked ? "Edit Individual Corners" : "Link All Corners"}
          title={isLinked ? "Edit Individual Corners" : "Link All Corners"}
          aria-pressed={!isLinked}
          data-active={!isLinked}
          onClick={isLinked ? handleExpand : handleCollapse}
        >
          <IconBorderCorners size={"var(--dt-icon-size-small)"} stroke={1.8} aria-hidden="true" />
        </IconButton>
      </div>
      {isLinked ? (
        <div className="dt-border-radius__linked-row">
          <TokenField
            property="border-radius"
            tokenRow={borderRadiusRow}
            domElement={el}
            entries={allEntries}
            editMetadata={metadataFor(borderRadiusRow)}
            onAfterEdit={onAfterEdit}
          />
        </div>
      ) : (
        <SideControls label="Border Radius Corners" sides={cornerSides} />
      )}
    </div>
  );
}
