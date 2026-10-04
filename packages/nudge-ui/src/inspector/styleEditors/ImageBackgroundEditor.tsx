import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { IconPhoto, IconUpload } from "@tabler/icons-react";
import { TokenValueField } from "../tokens/TokenField.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import type { StyleDeclaration } from "../tokens/editActions.ts";
import { getWorkspaceChanges } from "../changes/workspaceChanges.ts";
import { getStateStyleValue } from "../shell/stateValue.ts";
import { Button } from "../ui/Button.tsx";
import { InlineStyleWarning } from "../ui/InlineStyleWarning.tsx";
import { Select } from "../ui/Select.tsx";
import { StatusCallout } from "../ui/StatusCallout.tsx";
import { inlineBlockedBy } from "./inlineAuthored.ts";

const SIZING = [
  { value: "cover", label: "Cover" },
  { value: "contain", label: "Fit" },
  { value: "100% 100%", label: "Stretch" },
  { value: "auto", label: "Original size" },
  { value: "tile", label: "Tile" },
];

function imageUrl(value: string): string | null {
  const match = /^url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s"']+))\s*\)$/s.exec(value);
  const url = match?.[1] ?? match?.[2] ?? match?.[3];
  return url?.replace(/\\(["'\\])/g, "$1") ?? null;
}

function imageName(src: string, base: string): string {
  if (src.startsWith("data:")) return "Uploaded image";
  try { return decodeURIComponent(new URL(src, base).pathname.split("/").pop() || "Background image"); }
  catch { return "Background image"; }
}

interface ImageBackgroundEditorProps {
  element: HTMLElement;
  elements: readonly HTMLElement[];
  value: string;
  mixed: boolean;
  onUpload(value: string): boolean;
  onCss(value: string): boolean;
  onSizing(declarations: StyleDeclaration[]): boolean;
}

/** Preview uploaded images through the existing workspace style edits. */
export function ImageBackgroundEditor({ element, elements, value, mixed, onUpload, onCss, onSizing }: ImageBackgroundEditorProps): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const reader = useRef<FileReader | null>(null);
  const request = useRef(0);
  const currentElements = useRef(elements);
  currentElements.current = elements;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<{ src: string; name: string } | null>(null);
  const [sizingDraft, setSizingDraft] = useState<{ element: HTMLElement; revision: number; value: string } | null>(null);
  const src = mixed ? null : imageUrl(value);
  const title = src ? image?.src === src ? image.name : imageName(src, element.ownerDocument.baseURI) : null;
  const computedSize = getStateStyleValue(element, "background-size", "auto");
  const computedRepeat = getStateStyleValue(element, "background-repeat", "repeat");
  const computedSizing = computedRepeat === "repeat" && /^(?:auto|auto auto)$/.test(computedSize) ? "tile"
    : computedSize === "auto auto" ? "auto" : computedSize;
  const sizing = sizingDraft?.element === element && sizingDraft.revision === getWorkspaceChanges().revision ? sizingDraft.value : computedSizing;
  const uploadBlocked = inlineBlockedBy(elements, "background-image", "background-size", "background-repeat", "background-position");
  const sizingBlocked = inlineBlockedBy(elements, "background-size", "background-repeat", "background-position");

  useEffect(() => {
    setPending(false);
    setError(null);
    return () => { request.current++; reader.current?.abort(); };
  }, [element, value]);

  async function upload(file: File): Promise<void> {
    const id = ++request.current;
    const targets = [...elements];
    const isCurrent = (): boolean => request.current === id && currentElements.current.length === targets.length
      && currentElements.current.every((element, index) => element === targets[index]);
    if (!file.type.startsWith("image/")) { setError("Choose an image file."); return; }
    if (uploadBlocked) return;
    setPending(true);
    setError(null);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const fileReader = new FileReader();
        reader.current = fileReader;
        fileReader.onload = () => typeof fileReader.result === "string" ? resolve(fileReader.result) : reject(new Error("No image data"));
        fileReader.onerror = fileReader.onabort = () => reject(new Error("Cannot read image"));
        fileReader.readAsDataURL(file);
      });
      const probe = new Image();
      probe.src = data;
      await probe.decode();
      if (!isCurrent()) return;
      if (!onUpload(`url("${data}")`)) return;
      setImage({ src: data, name: file.name });
      setSizingDraft({ element, revision: getWorkspaceChanges().revision, value: "cover" });
    } catch {
      if (isCurrent()) setError("This image could not be loaded. Choose another file.");
    } finally {
      if (isCurrent()) setPending(false);
    }
  }

  function changeSizing(next: string): void {
    if (sizingBlocked) return;
    if (!onSizing([
      { property: "background-size", value: next === "tile" ? "auto" : next },
      { property: "background-repeat", value: next === "tile" ? "repeat" : "no-repeat" },
      { property: "background-position", value: "center" },
    ])) return;
    setSizingDraft({ element, revision: getWorkspaceChanges().revision, value: next });
  }

  return <div className="image-background" data-test="image-background-editor">
    <input ref={input} type="file" accept="image/*" hidden data-test="background-image-upload"
      aria-label="Upload background image" disabled={uploadBlocked !== null || pending}
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void upload(file);
      }} />
    {src ? <div className="image-background__grid">
      <Button variant="quiet" className="image-background__tile" aria-label="Replace background image"
        disabled={uploadBlocked !== null || pending} onClick={() => input.current?.click()}>
        <img className="image-background__thumb" src={src} alt="Background image thumbnail"
          onLoad={() => setImage((previous) => previous?.src === src ? previous : { src, name: imageName(src, element.ownerDocument.baseURI) })}
          onError={() => setError("The background image could not be loaded.")} />
        <span className="image-background__title" title={title ?? undefined}>{title}</span>
      </Button>
      <Select aria-label="Background image sizing" value={sizing}
        options={SIZING.some((option) => option.value === sizing) ? SIZING : [...SIZING, { value: sizing, label: `Custom (${sizing})` }]}
        disabled={sizingBlocked !== null} onValueChange={changeSizing} />
    </div> : <Button variant="secondary" disabled={uploadBlocked !== null || pending} onClick={() => input.current?.click()}>
      {pending ? <IconPhoto size={16} aria-hidden="true" /> : <IconUpload size={16} aria-hidden="true" />}
      {pending ? "Loading image…" : mixed ? "Upload image to replace backgrounds" : "Upload image"}
    </Button>}
    {!src && !mixed && value !== "none" ? <ControlSurface>
      <TokenValueField property="background-image" domElement={element} entries={[]} committedValue={value}
        label="Background image CSS" blockedBy={inlineBlockedBy(elements, "background-image")}
        onCommitRaw={(raw) => { if (typeof CSS === "undefined" || CSS.supports("background-image", raw)) onCss(raw); }}
        onSelectToken={() => false} onUnlink={onCss} />
    </ControlSurface> : null}
    <InlineStyleWarning blockedBy={uploadBlocked ?? sizingBlocked} />
    {error ? <StatusCallout tone="warning" role="alert">{error}</StatusCallout> : null}
  </div>;
}
