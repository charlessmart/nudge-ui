import { useRef, useState } from "react";
import type { ReactElement } from "react";
import { IconArrowsDiff, IconDroplet, IconMinus, IconPlus } from "@tabler/icons-react";
import { replaceColorPreservingOpacity, withColorOpacity } from "../../css/value-semantics/colorSemantics.ts";
import { interpretTokenValue } from "../../css/value-semantics/tokenInterpretation.ts";
import { getNudgeUiTokenEntries } from "../runtime/runtimeConfig.ts";
import { colorValueToHex, TokenValueField } from "../tokens/TokenField.tsx";
import { setStyles } from "../tokens/editActions.ts";
import { createChangeHistoryGroup, getActiveDraftChanges } from "../changes/draftChanges.ts";
import { getStateStyleValue } from "../shell/stateValue.ts";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { InlineStyleWarning } from "../ui/InlineStyleWarning.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { Select } from "../ui/Select.tsx";
import { ImageBackgroundEditor } from "./ImageBackgroundEditor.tsx";
import type { StyleDeclaration } from "../tokens/editActions.ts";
import { backgroundDeclarations, backgroundMode, BACKGROUND_BLEND_MODES, newBackgroundLayer, readBackgroundLayers } from "./backgroundLayers.ts";
import type { BackgroundLayer, BackgroundMode } from "./backgroundLayers.ts";
import type { ColorPickerProps } from "./ColorPicker.tsx";
import { inlineBlockedBy } from "./inlineAuthored.ts";
import { defaultGradient, parseGradient, serializeGradient } from "./gradientValue.ts";
import type { GradientStop, GradientType, GradientValue } from "./gradientValue.ts";

const MODES = [{ value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }, { value: "image", label: "Image" }] as const;
const TYPES = [{ value: "linear", label: "Linear" }, { value: "radial", label: "Radial" }, { value: "conic", label: "Conic" }];

/** Background layers are displayed in CSS paint order, with the top layer first. */
export function BackgroundEditor(props: ColorPickerProps): ReactElement {
  const { element, selection, onAfterEdit } = props;
  const el = element.domElement;
  const elements = selection?.domElements ?? [el];
  const source = readBackgroundLayers((property, fallback) => getStateStyleValue(el, property, fallback));
  const base = source.at(-1);
  const authoredColor = props.tokenRow?.property === "background-color" || props.tokenRow?.property === "background"
    ? props.tokenRow.authored ?? props.tokenRow.declaredValue : undefined;
  if (base?.baseColor && authoredColor) {
    const table = Object.fromEntries((props.entries ?? getNudgeUiTokenEntries()).map((entry) => [entry.name, entry]));
    const resolved = interpretTokenValue(authoredColor, { table }).resolvedValue;
    if (colorValueToHex(resolved) && colorValueToHex(resolved) === colorValueToHex(base.value)) base.value = authoredColor;
  }
  const [draft, setDraft] = useState<{ element: HTMLElement; elements: readonly HTMLElement[]; revision: number; layers: BackgroundLayer[] } | null>(null);
  const activeDraft = draft?.element === el && draft.revision === getActiveDraftChanges().revision
    && draft.elements.length === elements.length && draft.elements.every((element, index) => element === elements[index]) ? draft : null;
  const layers = activeDraft?.layers ?? source;
  const properties = ["background-color", "background-image", "background-blend-mode", "background-size", "background-repeat", "background-position"];
  const mixed = !activeDraft && elements.some((element) => properties.some((property) =>
    selection?.getProperty(property)?.value.kind === "mixed"
      || getStateStyleValue(element, property) !== getStateStyleValue(el, property)));
  const blockedBy = inlineBlockedBy(elements, ...properties);

  function commit(next: BackgroundLayer[]): boolean {
    const previous = backgroundDeclarations(layers);
    const declarations = backgroundDeclarations(next).filter((declaration) =>
      mixed || previous.find((current) => current.property === declaration.property)?.value !== declaration.value);
    if (inlineBlockedBy(elements, ...declarations.map((declaration) => declaration.property))) return false;
    if (declarations.length && !setStyles(selection?.target ?? el, declarations).length) return false;
    setDraft({ element: el, elements: [...elements], revision: getActiveDraftChanges().revision, layers: next });
    onAfterEdit?.();
    return true;
  }

  return <div className="editor background-editor" data-test="background-editor">
    <div className="editor__title-row">
      <div className="editor__title">Background</div>
      <InlineStyleWarning blockedBy={blockedBy} />
      <IconButton variant="quiet" label="Add background layer" disabled={blockedBy !== null}
        onClick={() => commit([{ ...newBackgroundLayer(), baseColor: mixed || layers.length === 0 }, ...(mixed ? [] : layers)])}>
        <IconPlus aria-hidden="true" />
      </IconButton>
    </div>
    {mixed ? <div className="background-editor__hint">Mixed backgrounds. Add a layer to replace them.</div> : layers.map((layer, index) =>
      <div className="background-editor__layer" role="group" aria-label={`Background layer ${index + 1}`} key={index}>
        <BackgroundLayerEditor {...props} layer={layer} baseColor={layer.baseColor && layer.mode === "solid"} bottomLayer={index === layers.length - 1}
          onChange={(next) => commit(layers.map((current, i) => i === index ? next : current))}
          onRemove={() => commit(layers.filter((_, i) => i !== index))} />
      </div>)}
  </div>;
}

interface BackgroundLayerEditorProps extends ColorPickerProps {
  layer: BackgroundLayer;
  baseColor: boolean;
  bottomLayer: boolean;
  onChange(layer: BackgroundLayer): boolean;
  onRemove(): void;
}

function previewColor(color: ReturnType<typeof interpretTokenValue>): string {
  const result = color.tokenName && color.opacity ? withColorOpacity(color.resolvedValue, color.opacity.value) : null;
  return result?.ok ? result.value : color.resolvedValue;
}

function BackgroundLayerEditor(props: BackgroundLayerEditorProps): ReactElement {
  const { element, selection, entries, layer, baseColor, bottomLayer, onChange, onRemove } = props;
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const tokenTable = Object.fromEntries(allEntries.map((entry) => [entry.name, entry]));
  const el = element.domElement;
  const elements = selection?.domElements ?? [el];
  const { value, mode } = layer;
  const gradient = layer.gradient ?? parseGradient(value);
  const blockedBy = inlineBlockedBy(elements, baseColor ? "background-color" : "background-image");
  const dragCommit = useRef<ReturnType<typeof createChangeHistoryGroup> | null>(null);

  function commit(nextValue: string, nextMode: BackgroundMode = backgroundMode(nextValue), nextGradient?: GradientValue, declarations: StyleDeclaration[] = []): boolean {
    if (blockedBy) return false;
    const next = {
      ...layer, value: nextValue, mode: nextMode, gradient: nextGradient,
      baseColor: layer.baseColor || (nextMode === "solid" && mode !== "solid" && bottomLayer),
    };
    for (const declaration of declarations) {
      if (declaration.property === "background-size") next.size = declaration.value;
      if (declaration.property === "background-repeat") next.repeat = declaration.value;
      if (declaration.property === "background-position") next.position = declaration.value;
    }
    return onChange(next);
  }
  function commitGradient(next: GradientValue): void { commit(serializeGradient(next), "gradient", next); }
  function changeMode(next: BackgroundMode): void {
    if (next === mode) return;
    if (next === "solid") commit("#ffffff", next);
    else if (next === "gradient") commitGradient(defaultGradient());
    else commit("none", next);
  }
  function updateStop(index: number, next: Partial<GradientStop>): void {
    if (gradient) commitGradient({ ...gradient, stops: gradient.stops.map((stop, i) => i === index ? { ...stop, ...next } : stop) });
  }
  function removeStop(index: number): void {
    if (!gradient || gradient.stops.length <= 2) return;
    commitGradient({ ...gradient, stops: gradient.stops.filter((_, i) => i !== index) });
  }
  function addStop(position = 50): void {
    if (!gradient) return;
    const color = gradient.stops[0]!.color;
    commitGradient({ ...gradient, stops: [...gradient.stops, { color, position }] });
  }
  function commitColor(index: number, stop: GradientStop, color: string): void {
    const result = replaceColorPreservingOpacity(stop.color, color, { tokenTable });
    if (result.ok) updateStop(index, { color: result.value });
  }
  function percentAt(track: HTMLElement, clientX: number): number {
    const rect = track.getBoundingClientRect();
    return rect.width > 0 ? Math.round(Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100))) : 50;
  }
  function rawField(label: string, current: string, onCommit: (value: string) => void, mixedValue = false): ReactElement {
    return <ControlSurface><TokenValueField property="background-image" domElement={el}
      entries={[]} committedValue={current} label={label} mixed={mixedValue} blockedBy={blockedBy}
      onCommitRaw={onCommit} onSelectToken={() => false} onUnlink={onCommit} /></ControlSurface>;
  }
  const toolbar = <div className="background-editor__type-row">
    <SegmentedControl aria-label="Background type" value={mode}
      options={MODES} onChange={changeMode} disabled={blockedBy !== null} />
    {!baseColor ? <Select iconOnly aria-label="Background blending mode" title={`Blend mode: ${layer.blend}`}
      value={layer.blend} options={BACKGROUND_BLEND_MODES}
      popupPosition={{ side: "top", align: "end" }}
      disabled={inlineBlockedBy(elements, "background-blend-mode") !== null}
      onValueChange={(blend) => onChange({ ...layer, blend })}>
      <IconDroplet aria-hidden="true" />
    </Select> : <span className="background-editor__blend-space" aria-hidden="true" />}
    <IconButton variant="quiet" label="Remove background layer" disabled={blockedBy !== null}
      onClick={onRemove}><IconMinus aria-hidden="true" /></IconButton>
  </div>;

  const color = interpretTokenValue(value, { table: tokenTable });
  if (mode === "solid") return <div className="background-editor__solid" data-property={baseColor ? "background-color" : "background-image"}>
    {toolbar}
    <ControlSurface><TokenValueField property={baseColor ? "background-color" : "background-image"} semanticSlot="color" domElement={el} isColor
      entries={allEntries} committedValue={color.tokenName ? value : colorValueToHex(value) ?? value}
      activeTokenName={color.tokenName} resolvedValue={previewColor(color)} opacity={color.opacity}
      label="Background Color" blockedBy={blockedBy}
      onCommitRaw={(raw) => {
        const result = replaceColorPreservingOpacity(value, raw, { tokenTable });
        if (result.ok) commit(result.value, "solid");
      }}
      onSelectToken={(token) => {
        const result = replaceColorPreservingOpacity(value, `var(${token.name})`, { tokenTable });
        return result.ok && commit(result.value, "solid");
      }}
      onUnlink={(raw) => commit(raw, "solid")}
      onCommitOpacity={(opacity) => {
        const result = withColorOpacity(value, opacity);
        return result.ok && commit(result.value, "solid");
      }} /></ControlSurface>
  </div>;

  return <div className="background-editor__content">
    {toolbar}
    {mode === "image" ? <ImageBackgroundEditor element={el} elements={elements} value={value} mixed={false} sizingValues={{ size: layer.size, repeat: layer.repeat }}
      onCss={(raw) => commit(raw, "image")}
      onUpload={(image) => commit(image, "image", undefined, [
        { property: "background-size", value: "cover" },
        { property: "background-repeat", value: "no-repeat" },
        { property: "background-position", value: "center" },
      ])}
      onSizing={(declarations) => commit(value, "image", undefined, declarations)} /> : gradient && mode === "gradient" ? <div className="background-editor__gradient">
      <div className="background-editor__track" data-test="gradient-track" aria-label="Gradient stops"
        style={{ backgroundImage: serializeGradient({ ...gradient, type: "linear", angle: 90, prelude: "", repeating: false,
          stops: gradient.stops.map((stop) => ({ ...stop, color: previewColor(interpretTokenValue(stop.color, { table: tokenTable })) })) }) }}
        onPointerDown={(event) => { if (event.target === event.currentTarget && event.button === 0) addStop(percentAt(event.currentTarget, event.clientX)); }}>
        {gradient.stops.map((stop, index) => <button type="button" key={index}
          className="background-editor__stop" aria-label={`Gradient stop ${index + 1}`}
          disabled={blockedBy !== null} style={{ left: `clamp(8px, ${stop.position}%, calc(100% - 8px))`, backgroundColor: previewColor(interpretTokenValue(stop.color, { table: tokenTable })) }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            dragCommit.current = createChangeHistoryGroup();
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              const position = percentAt(event.currentTarget.parentElement!, event.clientX);
              if (position !== stop.position) dragCommit.current?.(() => updateStop(index, { position }));
            }
          }}
          onPointerUp={(event) => {
            dragCommit.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => { dragCommit.current = null; }}
          onLostPointerCapture={() => { dragCommit.current = null; }}
          onDoubleClick={() => removeStop(index)}
          onKeyDown={(event) => {
            if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); event.stopPropagation(); removeStop(index); }
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              event.stopPropagation();
              updateStop(index, { position: Math.max(0, Math.min(100, stop.position + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 : 1))) });
            }
          }} />)}
      </div>
      <div className="background-editor__toolbar">
        <Select aria-label="Gradient type" value={gradient.type} options={TYPES} disabled={blockedBy !== null}
          onValueChange={(type) => commitGradient({ ...gradient, type: type as GradientType, prelude: type === "radial" ? "circle at center" : "" })} />
        {gradient.type !== "radial" ? rawField("Gradient angle", `${gradient.angle}deg`, (raw) => {
          const match = /^([+-]?(?:\d*\.)?\d+)(?:deg)?$/.exec(raw.trim());
          if (match && Number.isFinite(Number(match[1]))) commitGradient({ ...gradient, angle: Number(match[1]) });
        }) : null}
        <IconButton variant="quiet" label="Reverse gradient" disabled={blockedBy !== null}
          onClick={() => commitGradient({ ...gradient, stops: [...gradient.stops].reverse().map((stop) => ({ ...stop, position: 100 - stop.position })) })}>
          <IconArrowsDiff aria-hidden="true" /></IconButton>
        <IconButton variant="quiet" label="Add gradient stop" disabled={blockedBy !== null} onClick={() => addStop()}>
          <IconPlus aria-hidden="true" /></IconButton>
      </div>
      {gradient.stops.map((stop, index) => ({ stop, index })).sort((a, b) => a.stop.position - b.stop.position).map(({ stop, index }) => {
        const color = interpretTokenValue(stop.color, { table: tokenTable });
        return <div className="background-editor__stop-row" key={index} role="group" aria-label={`Stop ${index + 1}`}>
          {rawField(`Stop ${index + 1} position`, `${Number(stop.position.toFixed(3))}%`, (raw) => {
            const match = /^([+-]?(?:\d*\.)?\d+)%?$/.exec(raw.trim());
            if (match) updateStop(index, { position: Math.max(0, Math.min(100, Number(match[1]))) });
          })}
          <ControlSurface><TokenValueField property="background-image" semanticSlot="color" domElement={el} isColor
            entries={allEntries} activeTokenName={color.tokenName}
            committedValue={color.tokenName ? stop.color : colorValueToHex(stop.color) ?? stop.color} resolvedValue={previewColor(color)}
            label={`Stop ${index + 1} color`} blockedBy={blockedBy} opacity={color.opacity}
            onCommitRaw={(color) => commitColor(index, stop, color)}
            onSelectToken={(token) => commitColor(index, stop, `var(${token.name})`)}
            onUnlink={(color) => updateStop(index, { color: previewColor(interpretTokenValue(color, { table: tokenTable })) })}
            onCommitOpacity={(opacity) => {
              const result = withColorOpacity(stop.color, opacity);
              if (!result.ok) return false;
              updateStop(index, { color: result.value });
            }} /></ControlSurface>
          <IconButton variant="quiet" label={`Remove stop ${index + 1}`} disabled={blockedBy !== null || gradient.stops.length <= 2}
            onClick={() => removeStop(index)}><IconMinus aria-hidden="true" /></IconButton>
        </div>;
      })}
    </div> : <div className="background-editor__raw">
      {mode === "gradient" ? <div className="background-editor__hint">Edit this background using CSS.</div> : null}
      {rawField("Background image CSS", value, (raw) => {
        if (typeof CSS !== "undefined" && !CSS.supports("background-image", raw)) return;
        commit(raw, mode);
      }, false)}
      {mode === "gradient" ? <IconButton variant="quiet" label="Add linear gradient" disabled={blockedBy !== null}
        onClick={() => commitGradient(defaultGradient())}><IconPlus aria-hidden="true" /></IconButton> : null}
    </div>}
  </div>;
}
