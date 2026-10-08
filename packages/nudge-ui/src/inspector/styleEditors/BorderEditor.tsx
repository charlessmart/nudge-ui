import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import {
  IconBorderSides,
  IconBorderStyle2,
  IconCheck,
  IconMinus,
  IconPlus,
} from "@tabler/icons-react";
import type { TokenEntry } from "../../css/model/index.ts";
import type { ResolvedProperty } from "../../css/model/index.ts";
import { findTokenRow } from "./rowLookup.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { SelectedElement } from "../selection/selectionStore.ts";
import { setStyles } from "../tokens/editActions.ts";
import { FieldRow } from "../ui/FieldRow.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { ToggleButton } from "../ui/ToggleButton.tsx";
import { formatInspectorLabel } from "../ui/labels.ts";
import { getStateStyleValue } from "../shell/stateValue.ts";
import { PopoverListbox } from "../ui/PopoverListbox.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { getNudgeUiTokenEntries } from "../runtime/runtimeConfig.ts";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
import { useFieldVisibility } from "./useFieldVisibility.ts";
import { Tooltip } from "../ui/Tooltip.tsx";
import { inlineStyleWarningContent } from "../ui/InlineStyleWarning.tsx";
import { inlineBlockedBy } from "./inlineAuthored.ts";
import {
  BORDER_SIDES,
  BORDER_STYLES,
  borderDeclarations,
  borderProperty,
  hasVisibleBorder,
  readBorderEditor,
  type BorderIntent,
  type BorderSide,
  type BorderSource,
  type ComputedStyleReader,
} from "./borderModel.ts";

function stateStyleReader(el: HTMLElement): ComputedStyleReader {
  return (property, fallback) => getStateStyleValue(el, property, fallback);
}

/** Reports whether the intent produced any declarations to write. */
function commitBorderIntent(target: EditTarget, source: BorderSource, intent: BorderIntent, onAfterEdit?: () => void): boolean {
  const declarations = borderDeclarations(source, intent);
  if (declarations.length === 0) return false;
  setStyles(target, declarations);
  onAfterEdit?.();
  return true;
}

export interface BorderEditorProps {
  element: SelectedElement;
  selection?: StyleSelection | null;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

/**
 * Linked presentation from cascade data + optional user toggle.
 * Divergent faces always open; equal faces start linked but can expand.
 * Linking divergent faces is optimistic until cascade rows catch up.
 */
function useBorderLinkedState(dataLinked: boolean, resetKey: HTMLElement): [boolean, (next: boolean) => void] {
  const [userUnlinked, setUserUnlinked] = useState(false);
  const [userLinked, setUserLinked] = useState(false);

  useEffect(() => {
    setUserUnlinked(false);
    setUserLinked(false);
  }, [resetKey]);

  useEffect(() => {
    if (dataLinked) setUserLinked(false);
    else setUserUnlinked(false);
  }, [dataLinked]);

  const isLinked = dataLinked ? !userUnlinked : userLinked;
  function setLinked(next: boolean): void {
    if (next) {
      setUserUnlinked(false);
      setUserLinked(true);
    } else {
      setUserLinked(false);
      setUserUnlinked(true);
    }
  }
  return [isLinked, setLinked];
}

export function BorderEditor(props: BorderEditorProps): ReactElement {
  const { element, selection, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const selectedElements = selection?.domElements ?? [el];
  const editTarget: EditTarget = selection?.target ?? el;
  const isGroup = Boolean(selection && selection.elements.length > 1);
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const borderBlockedBy = inlineBlockedBy(selectedElements, "border", "border-width", "border-style", "border-color");
  const source: BorderSource = { rows: tokenRows, computed: stateStyleReader(el) };
  const border = readBorderEditor(source, { group: isGroup });
  const [borderLinked, setBorderLinked] = useBorderLinkedState(border.sidesLinked, el);
  const showWidthAndColor = !borderLinked || border.linkedStyleDraws;

  const hasBorder = selectedElements.some((element) => hasVisibleBorder(stateStyleReader(element)));
  const visibility = useFieldVisibility(selectedElements, "border", hasBorder);
  const showBorderControls = visibility.visible;

  function handleAddBorder(): void {
    if (borderBlockedBy) return;
    commitBorderIntent(editTarget, source, { kind: "add" }, onAfterEdit);
    visibility.show();
  }

  function handleRemoveBorder(): void {
    if (borderBlockedBy) return;
    commitBorderIntent(editTarget, source, { kind: "remove" }, onAfterEdit);
    visibility.hide();
  }

  function handleExpand(): void {
    setBorderLinked(false);
  }

  function handleCollapse(): void {
    if (borderBlockedBy) return;
    setBorderLinked(true);
    commitBorderIntent(editTarget, source, { kind: "link-sides" }, onAfterEdit);
  }

  function handleSelectStyle(property: string, style: string): boolean {
    return commitBorderIntent(editTarget, source, { kind: "set-style", property, style }, onAfterEdit);
  }

  const sideRows = BORDER_SIDES.map((side) => ({
    side,
    color: (
      <ControlSurface>
        <TokenField
          property={borderProperty("color", side)}
          selection={selection}
          tokenRow={findTokenRow(tokenRows, borderProperty("color", side))}
          domElement={el}
          editTarget={editTarget}
          entries={allEntries}
          onAfterEdit={onAfterEdit}
        />
      </ControlSurface>
    ),
    width: (
      <ControlSurface>
        <TokenField
          property={borderProperty("width", side)}
          selection={selection}
          tokenRow={findTokenRow(tokenRows, borderProperty("width", side))}
          domElement={el}
          editTarget={editTarget}
          entries={allEntries}
          onAfterEdit={onAfterEdit}
          chipVariant="small"
        />
      </ControlSurface>
    ),
    style: (
      <BorderStyleSettingsMenu
        property={borderProperty("style", side)}
        tokenRow={findTokenRow(tokenRows, borderProperty("style", side))}
        domElement={el}
        selection={selection}
        dataTest={`border-style-${side}`}
        onSelectStyle={handleSelectStyle}
      />
    ),
  }));

  return (
    <div className={`editor`} data-test="border-editor">
      <div className="editor__title-row">
        <div className="editor__title">Border</div>
        {showBorderControls ? (
          <Tooltip content={inlineStyleWarningContent(borderBlockedBy)}>
            <IconButton
              variant="quiet"
              label="Remove Border"
              data-test="remove-border"
              className="border__remove"
              disabled={borderBlockedBy !== null}
              onClick={handleRemoveBorder}
            >
              <IconMinus size={16} aria-hidden="true" />
            </IconButton>
          </Tooltip>
        ) : (
          <IconButton
            variant="quiet"
            label="Add Border"
            data-test="add-border"
            className="border__add"
            disabled={borderBlockedBy !== null}
            onClick={handleAddBorder}
          >
            <IconPlus size={16} aria-hidden="true" />
          </IconButton>
        )}
      </div>
      {showBorderControls && (
        <div className="border" data-expanded={borderLinked ? "false" : "true"}>
          {border.rawShorthandRow ? (
            <FieldRow label="Border">
              <ControlSurface>
                <TokenField
                  property="border"
                  selection={selection}
                  tokenRow={border.rawShorthandRow}
                  domElement={el}
                  editTarget={editTarget}
                  entries={allEntries}
                  onAfterEdit={onAfterEdit}
                />
              </ControlSurface>
            </FieldRow>
          ) : borderLinked ? (
            <div className="border__linked-row">
              {showWidthAndColor ? (
                <>
                  <div className="border__linked-control border__linked-control--color">
                    <ControlSurface>
                      <TokenField
                        property="border-color"
                        selection={selection}
                        tokenRow={border.linkedRows.color}
                        domElement={el}
                        editTarget={editTarget}
                        entries={allEntries}
                        onAfterEdit={onAfterEdit}
                      />
                    </ControlSurface>
                  </div>
                  <div className="border__linked-control border__linked-control--width">
                    <ControlSurface>
                      <TokenField
                        property="border-width"
                        selection={selection}
                        tokenRow={border.linkedRows.width}
                        domElement={el}
                        editTarget={editTarget}
                        entries={allEntries}
                        onAfterEdit={onAfterEdit}
                        chipVariant="small"
                      />
                    </ControlSurface>
                  </div>
                </>
              ) : null}
              <BorderStyleSettingsMenu
                property="border-style"
                tokenRow={border.linkedRows.style}
                domElement={el}
                selection={selection}
                onSelectStyle={handleSelectStyle}
              />
              <ToggleButton
                variant="quiet"
                size="default"
                data-test="border-expand"
                label="Edit Individual Border Sides"
                pressed={!borderLinked}
                onPressedChange={(pressed) => {
                  if (pressed) handleExpand();
                }}
              >
                <IconBorderSides size={16} aria-hidden="true" />
              </ToggleButton>
            </div>
          ) : (
            <div className="border__expanded">
              <div className="border__expanded-header">
                <span className="side-values__label">{formatInspectorLabel("Individual Sides")}</span>
                <ToggleButton
                  variant="quiet"
                  size="default"
                  data-test="border-collapse"
                  label="Link All Border Sides"
                  pressed={!borderLinked}
                  disabled={borderBlockedBy !== null}
                  onPressedChange={(pressed) => {
                    if (!pressed) handleCollapse();
                  }}
                >
                  <IconBorderSides size={16} aria-hidden="true" />
                </ToggleButton>
              </div>
              {showWidthAndColor ? (
                <div className="border__side-rows" data-test="border-side-rows">
                  {sideRows.map(({ side, color, width, style }) => (
                    <div
                      className="border__side-row"
                      data-side={side}
                      aria-label={`Border ${formatInspectorLabel(side)}`}
                      key={side}
                    >
                      <BorderSideIndicator side={side} />
                      <div className="border__side-control border__side-control--color">{color}</div>
                      <div className="border__side-control border__side-control--width">{width}</div>
                      {style}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        }
      </div>
      )}
    </div>
  );
}

const BORDER_SIDE_ICON_PATHS = {
  left: {
    outline: "M20 3H4v18h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1Z",
    emphasis: { x1: "3.5", y1: "3.5", x2: "3.5", y2: "20.5" },
  },
  right: {
    outline: "M4 3a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16V3H4Z",
    emphasis: { x1: "20.5", y1: "3.5", x2: "20.5", y2: "20.5" },
  },
  top: {
    outline: "M21 20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4h18v16Z",
    emphasis: { x1: "3.5", y1: "3.5", x2: "20.5", y2: "3.5" },
  },
  bottom: {
    outline: "M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v17H3V4Z",
    emphasis: { x1: "3.5", y1: "20.5", x2: "20.5", y2: "20.5" },
  },
} as const;

function BorderSideIndicator({ side }: { side: BorderSide }): ReactElement {
  const { outline, emphasis } = BORDER_SIDE_ICON_PATHS[side];
  return (
    <svg className="side-values__icon side-values__side-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={outline} stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="square" strokeOpacity="0.2" />
      <line {...emphasis} stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" />
    </svg>
  );
}

interface BorderStyleSettingsMenuProps {
  property: string;
  tokenRow?: ResolvedProperty | null;
  domElement: HTMLElement;
  selection?: StyleSelection | null;
  dataTest?: string;
  /** Returns false when the style was not written. */
  onSelectStyle: (property: string, style: string) => boolean;
}

function BorderStyleSettingsMenu({ property, tokenRow, domElement: el, selection, dataTest = "border-style-settings", onSelectStyle }: BorderStyleSettingsMenuProps): ReactElement {
  const structured = tokenRow?.structure?.style?.trim().toLowerCase() ?? "";
  const selectedValue = selection?.getProperty(property)?.value;
  const mixed = selectedValue?.kind === "mixed";
  const commonValue = selectedValue?.kind === "common" ? selectedValue.value : "";
  const blockedBy = inlineBlockedBy(selection?.domElements ?? [el], property);
  const initial = mixed ? "Mixed" : commonValue || structured || getStateStyleValue(el, property, "none") || "none";
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setValue(mixed ? "Mixed" : commonValue || structured || getStateStyleValue(el, property, "none") || "none");
  }, [commonValue, el, mixed, property, structured]);

  function handleChange(next: string): void {
    if (blockedBy || !onSelectStyle(property, next)) return;
    setValue(next);
    setOpen(false);
  }

  return (
    <PopoverListbox
      query=""
      value={null}
      open={open}
      triggerElement={(
        <IconButton
          variant="quiet"
          size="default"
          label={`Border style: ${formatInspectorLabel(value)}`}
          data-test={dataTest}
          data-current-style={value}
        >
          <IconBorderStyle2 size={16} aria-hidden="true" />
        </IconButton>
      )}
      triggerDataTest={dataTest}
      triggerAriaLabel="Border style settings"
      triggerTooltip={inlineStyleWarningContent(blockedBy)}
      disabled={blockedBy !== null}
      items={BORDER_STYLES.map((style) => ({
        value: style,
        label: formatInspectorLabel(style),
        leading: style === value ? <IconCheck size={14} stroke={2} aria-hidden="true" /> : undefined,
        "data-test": `border-style-setting-${style}`,
      }))}
      onQueryChange={() => undefined}
      onOpenChange={setOpen}
      onSelect={handleChange}
    />
  );
}
