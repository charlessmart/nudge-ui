import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { IconBoxMargin, IconLetterX, IconLetterY, IconMinus, IconPlus } from "@tabler/icons-react";
import type { TokenEntry, ResolvedProperty } from "../../css/model/index.ts";
import { splitTopLevel, splitTopLevelWhitespace } from "../../css/value-semantics/cssSyntax.ts";
import { interpretTokenValue } from "../../css/value-semantics/tokenInterpretation.ts";
import { applyColorOpacity, replaceColorPreservingOpacity, withColorOpacity } from "../../css/value-semantics/colorSemantics.ts";
import { colorValueToHex, TokenField, TokenValueField } from "../tokens/TokenField.tsx";
import { setStyle } from "../tokens/editActions.ts";
import type { SelectedElement } from "../selection/selectionStore.ts";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { getNudgeUiTokenEntries } from "../runtime/runtimeConfig.ts";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { getStateStyleValue } from "../shell/stateValue.ts";
import { hasAuthoredProperty } from "./stylePresence.ts";
import { useFieldVisibility } from "./useFieldVisibility.ts";
import { inlineBlockedBy } from "./inlineAuthored.ts";
import { metadataFor } from "./rowLookup.ts";
import { completeCssValue } from "./completeCssValue.ts";
import { valuePolicyFor } from "./valuePolicy.ts";

interface ShadowLayer {
  lengths: [string, string, string, string];
  color: string;
  inset: boolean;
}

const LENGTH = /^(?:[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?(?:[a-z]+)?|(?:calc|min|max|clamp)\(.+\))$/i;
const DIMENSIONS = [
  { label: "X Offset", description: "X offset", Icon: IconLetterX },
  { label: "Y Offset", description: "Y offset", Icon: IconLetterY },
  { label: "Blur", description: "Blur", Icon: ShadowBlurIcon },
  { label: "Spread", description: "Spread", Icon: IconBoxMargin },
] as const;

function ShadowBlurIcon({ size = 16 }: { size?: number; stroke?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <circle opacity="0.5" cx="7.55555" cy="3.11111" r="1.11111" />
      <circle cx="7.55555" cy="7.55555" r="1.11111" />
      <circle cx="7.55555" cy="12" r="1.11111" />
      <circle opacity="0.5" cx="7.55555" cy="16.4444" r="1.11111" />
      <circle opacity="0.3" cx="7.55555" cy="20.8889" r="1.11111" />
      <circle opacity="0.3" cx="12" cy="3.11111" r="1.11111" />
      <circle cx="12" cy="7.55555" r="1.11111" />
      <circle cx="12" cy="12" r="1.11111" />
      <circle cx="12" cy="16.4444" r="1.11111" />
      <circle opacity="0.3" cx="12" cy="20.8889" r="1.11111" />
      <circle opacity="0.3" cx="16.4444" cy="3.11111" r="1.11111" />
      <circle opacity="0.5" cx="16.4444" cy="7.55555" r="1.11111" />
      <circle cx="16.4444" cy="12" r="1.11111" />
      <circle cx="16.4444" cy="16.4444" r="1.11111" />
      <circle opacity="0.5" cx="16.4444" cy="20.8889" r="1.11111" />
      <circle opacity="0.3" cx="20.8889" cy="3.11111" r="1.11111" />
      <circle opacity="0.3" cx="20.8889" cy="7.55555" r="1.11111" />
      <circle opacity="0.3" cx="20.8889" cy="12" r="1.11111" />
      <circle opacity="0.5" cx="20.8889" cy="16.4444" r="1.11111" />
      <circle opacity="0.5" cx="20.8889" cy="20.8889" r="1.11111" />
      <circle opacity="0.5" cx="3.11111" cy="3.11111" r="1.11111" />
      <circle opacity="0.5" cx="3.11111" cy="7.55555" r="1.11111" />
      <circle opacity="0.3" cx="3.11111" cy="12" r="1.11111" />
      <circle opacity="0.3" cx="3.11111" cy="16.4444" r="1.11111" />
      <circle opacity="0.3" cx="3.11111" cy="20.8889" r="1.11111" />
    </svg>
  );
}

function defaultShadow(): ShadowLayer {
  return { lengths: ["0", "2px", "3px", "0"], color: "rgb(0 0 0 / 20%)", inset: false };
}

function parseShadows(value: string, entries: TokenEntry[]): ShadowLayer[] | null {
  if (!value || value === "none") return [];
  const result: ShadowLayer[] = [];
  for (const layer of splitTopLevel(value, ",")) {
    const parts = splitTopLevelWhitespace(layer.trim());
    const isLength = (part: string): boolean => LENGTH.test(resolveToken(part, entries));
    const lengths = parts.filter(isLength);
    const colors = parts.filter((part) => part !== "inset" && !isLength(part));
    if (lengths.length < 2 || lengths.length > 4 || colors.length > 1) return null;
    result.push({
      lengths: [lengths[0]!, lengths[1]!, lengths[2] ?? "0", lengths[3] ?? "0"],
      color: colors[0] ?? "currentColor",
      inset: parts.includes("inset"),
    });
  }
  return result.length ? result : null;
}

function tokenName(value: string): string | null {
  return /^var\((--[\w-]+)\)$/.exec(value)?.[1] ?? null;
}

function resolveToken(value: string, entries: TokenEntry[]): string {
  const name = tokenName(value);
  return entries.find((entry) => entry.name === name)?.value ?? value;
}

function serializeShadows(layers: ShadowLayer[]): string {
  if (layers.length === 0) return "none";
  return layers.map((layer) => `${layer.inset ? "inset " : ""}${layer.lengths.join(" ")} ${layer.color}`).join(", ");
}

export interface BoxShadowEditorProps {
  element: SelectedElement;
  selection?: StyleSelection | null;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function BoxShadowEditor(props: BoxShadowEditorProps): ReactElement {
  const { element, selection, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const editTarget: EditTarget = selection?.target ?? el;
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const tokenRow = tokenRows.find((row) => row.property === "box-shadow") ?? null;
  const elements = selection?.domElements ?? [el];
  const colorContext = { tokenTable: Object.fromEntries(allEntries.map((entry) => [entry.name, entry])) };
  const computed = getStateStyleValue(el, "box-shadow");
  const source = tokenRow?.authored ?? tokenRow?.declaredValue ?? computed;
  const [draft, setDraft] = useState<{ element: HTMLElement; source: string; value: string } | null>(null);
  useEffect(() => setDraft(null), [el, source]);
  const activeDraft = draft?.element === el && draft.source === source ? draft : null;
  const value = activeDraft?.value ?? source;
  // A row can reference a color or length token without the entire shadow being token-backed.
  const wholeShadowToken = tokenRow?.tokenName
    && value.trim().startsWith("var(")
    && splitTopLevelWhitespace(value.trim()).length === 1;
  const selectedProperty = selection && selection.elements.length > 1 ? selection.getProperty("box-shadow") : null;
  const mixed = selectedProperty?.value.kind === "mixed";
  const layers = mixed ? null : parseShadows(value, allEntries)
    ?? parseShadows(tokenRow?.resolvedValue ?? computed, allEntries);
  const blockedBy = inlineBlockedBy(elements, "box-shadow");
  const hasShadow = hasAuthoredProperty(selection, "box-shadow", tokenRow) || elements.some((element) => {
    const value = getStateStyleValue(element, "box-shadow");
    return value !== "" && value !== "none";
  });
  const visibility = useFieldVisibility(elements, "box-shadow", hasShadow);

  function commitLayers(nextLayers: ShadowLayer[]): boolean {
    if (blockedBy) return false;
    const nextValue = serializeShadows(nextLayers);
    if (!setStyle(editTarget, "box-shadow", nextValue, selection && selection.elements.length > 1 ? undefined : metadataFor(tokenRow))) return false;
    setDraft({ element: el, source, value: nextValue });
    onAfterEdit?.();
    return true;
  }

  function commitLayer(index: number, next: ShadowLayer): void {
    if (!layers) return;
    commitLayers(layers.map((layer, layerIndex) => layerIndex === index ? next : layer));
  }

  function addShadow(): void {
    if (!layers) return;
    if (commitLayers([...layers, defaultShadow()])) visibility.show();
  }

  function removeShadow(index: number): void {
    if (!layers) return;
    const remaining = layers.filter((_, layerIndex) => layerIndex !== index);
    if (commitLayers(remaining) && remaining.length === 0) visibility.hide();
  }

  function commitColor(index: number, layer: ShadowLayer, color: string): void {
    const result = replaceColorPreservingOpacity(layer.color, color, colorContext);
    if (result.ok) commitLayer(index, { ...layer, color: result.value });
  }

  return (
    <div className="editor box-shadow-editor" data-test="box-shadow-editor">
      <div className="editor__title-row">
        <div className="editor__title">Box Shadow</div>
        <IconButton variant="quiet" label="Add Box Shadow" data-test="add-shadow"
          disabled={blockedBy !== null || layers === null} onClick={addShadow}>
          <IconPlus size={16} aria-hidden="true" />
        </IconButton>
      </div>
      {visibility.visible ? <div className="box-shadow-editor__layers">
        {!layers || (wholeShadowToken && !activeDraft) ? <ControlSurface>
          <TokenField property="box-shadow" selection={selection} tokenRow={tokenRow} domElement={el}
            editTarget={editTarget} entries={allEntries} onAfterEdit={onAfterEdit} editMetadata={metadataFor(tokenRow)} />
        </ControlSurface> : null}
        {layers?.map((layer, index) => {
          const color = interpretTokenValue(layer.color, { table: colorContext.tokenTable });
          const hex = color.tokenName && color.opacity ? colorValueToHex(color.resolvedValue) : null;
          const previewResult = hex && color.opacity ? withColorOpacity(hex, color.opacity.value) : null;
          const preview = previewResult?.ok ? previewResult.value : color.resolvedValue;
          return (
            <div className="box-shadow-editor__layer" key={index} role="group" aria-label={`Shadow ${index + 1}`}>
              <div className="box-shadow-editor__dimensions">
                {DIMENSIONS.map(({ label, description, Icon }, dimension) => (
                  <Tooltip key={label} content={description} disableFocus>
                    <ControlSurface>
                      <TokenValueField property="box-shadow" semanticSlot="length" nudgeProperty={dimension === 2 ? "padding-top" : "margin-left"} domElement={el}
                        committedValue={layer.lengths[dimension]!.replace(/px$/i, "")} activeTokenName={tokenName(layer.lengths[dimension]!)}
                        resolvedValue={resolveToken(layer.lengths[dimension]!, allEntries)} entries={allEntries} blockedBy={blockedBy}
                        label={label} inputDataTest={`shadow-${index}-${dimension}`} chipVariant="small"
                        leading={<Icon size={16} stroke={1.8} aria-hidden="true" />}
                        formatRawValue={(raw) => completeCssValue(raw, valuePolicyFor("border-width"))}
                        onCommitRaw={(input) => {
                          const raw = completeCssValue(input, valuePolicyFor("border-width"));
                          if (!LENGTH.test(raw) || (dimension === 2 && /^-/.test(raw))) return;
                          const lengths: ShadowLayer["lengths"] = [...layer.lengths];
                          lengths[dimension] = raw;
                          commitLayer(index, { ...layer, lengths });
                        }}
                        onSelectToken={(token) => {
                          const lengths: ShadowLayer["lengths"] = [...layer.lengths];
                          lengths[dimension] = `var(${token.name})`;
                          commitLayer(index, { ...layer, lengths });
                        }}
                        onUnlink={(raw) => {
                          const lengths: ShadowLayer["lengths"] = [...layer.lengths];
                          lengths[dimension] = raw;
                          commitLayer(index, { ...layer, lengths });
                        }} />
                    </ControlSurface>
                  </Tooltip>
                ))}
              </div>
              <IconButton variant="quiet" className="box-shadow-editor__remove"
                label={`Remove Shadow ${index + 1}`} data-test={`remove-shadow-${index}`}
                disabled={blockedBy !== null} onClick={() => removeShadow(index)}>
                <IconMinus size={16} aria-hidden="true" />
              </IconButton>
              <Tooltip content="Color and opacity" disableFocus>
                <ControlSurface className="box-shadow-editor__color">
                  <TokenValueField property="box-shadow" semanticSlot="color" domElement={el} isColor
                    committedValue={tokenName(layer.color) || layer.color === "currentColor" ? layer.color : colorValueToHex(layer.color) ?? layer.color} activeTokenName={color.tokenName}
                    resolvedValue={preview} entries={allEntries} blockedBy={blockedBy}
                    label="Shadow Color" inputDataTest={`shadow-${index}-color`}
                    opacity={color.opacity}
                    onCommitRaw={(color) => commitColor(index, layer, color)}
                    onSelectToken={(token) => commitColor(index, layer, `var(${token.name})`)}
                    onUnlink={(color) => commitLayer(index, { ...layer, color })}
                    onCommitOpacity={(opacity) => {
                      const result = applyColorOpacity(layer.color, opacity);
                      if (!result.ok) return false;
                      commitLayer(index, { ...layer, color: result.value });
                    }} />
                </ControlSurface>
              </Tooltip>
            </div>
          );
        })}
      </div> : null}
    </div>
  );
}
