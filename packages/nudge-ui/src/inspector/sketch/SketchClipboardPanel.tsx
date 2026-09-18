import { useState } from "react";
import type { ReactElement } from "react";
import { IconCheck, IconCopy, IconDownload } from "@tabler/icons-react";
import { copyToClipboard } from "../prompt/copyToClipboard.ts";
import { Button } from "../ui/Button.tsx";
import { StatusCallout } from "../ui/StatusCallout.tsx";
import { copyImageAndTextToClipboard, copyImageToClipboard, downloadImage } from "./raster.ts";
import { markSketchesHandedOff } from "./store.ts";
import { clearSketchClipboardHandoff, useSketchClipboardHandoff, type SketchHandoffEntry } from "./handoff.ts";

export function SketchClipboardPanel({ prompt }: { readonly prompt: string | null }): ReactElement | null {
  const handoff = useSketchClipboardHandoff();
  const [copied, setCopied] = useState(false);
  const [copiedBundle, setCopiedBundle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!handoff) return null;
  const currentHandoff = handoff;

  async function copyPrompt(): Promise<void> {
    if (!prompt) return;
    setError(null);
    try {
      await copyToClipboard(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "The prompt could not be copied.");
    }
  }

  async function copyImageAndPrompt(entry: SketchHandoffEntry): Promise<void> {
    if (!prompt) return;
    setError(null);
    try {
      await copyImageAndTextToClipboard(entry.annotatedImage, prompt);
      const entryKey = `${entry.id}:${entry.revision}`;
      setCopiedBundle(entryKey);
      window.setTimeout(() => {
        setCopiedBundle((current) => current === entryKey ? null : current);
      }, 1500);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "The image and prompt could not be copied.");
    }
  }

  async function markHandedOff(): Promise<void> {
    setError(null);
    try {
      const marked = await markSketchesHandedOff(
        currentHandoff.entries.map((entry) => ({ id: entry.id, revision: entry.revision })),
        currentHandoff.localBatchId,
      );
      if (marked) clearSketchClipboardHandoff();
      else setError("These sketches changed before they could be marked handed off. Reopen the current sketch list.");
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "The sketches could not be updated.");
    }
  }

  return (
    <StatusCallout className="sketch-clipboard" tone="accent" data-test="sketch-clipboard-panel">
      <div className="sketch-clipboard__title">Sketch images are ready for handoff</div>
      <p className="sketch-clipboard__copy">
        Copy an image with the prompt in one clipboard item, or copy them separately if your destination needs one format. Mark handed off when you are finished.
      </p>
      <div className="sketch-clipboard__items">
        {currentHandoff.entries.map((entry) => (
          <div className="sketch-clipboard__item" key={`${entry.id}:${entry.revision}`}>
            <span>{entry.metadata.filename}</span>
            <div className="sketch-clipboard__item-actions">
              {prompt ? (
                <Button
                  size="compact"
                  variant="quiet"
                  type="button"
                  data-test="sketch-clipboard-copy-image-and-prompt"
                  onClick={() => void copyImageAndPrompt(entry)}
                >
                  {copiedBundle === `${entry.id}:${entry.revision}`
                    ? <IconCheck size="var(--icon-size-small)" aria-hidden="true" />
                    : <IconCopy size="var(--icon-size-small)" aria-hidden="true" />}
                  {copiedBundle === `${entry.id}:${entry.revision}` ? "Copied" : "Copy image + prompt"}
                </Button>
              ) : null}
              <Button size="compact" variant="quiet" type="button" data-test="sketch-clipboard-copy-image" onClick={() => void copyImageToClipboard(entry.annotatedImage).catch((copyError: unknown) => setError(copyError instanceof Error ? copyError.message : "The image could not be copied."))}>
                <IconCopy size="var(--icon-size-small)" aria-hidden="true" /> Copy image
              </Button>
              <Button size="compact" variant="quiet" type="button" data-test="sketch-clipboard-download-image" onClick={() => downloadImage(entry.annotatedImage, entry.metadata.filename)}>
                <IconDownload size="var(--icon-size-small)" aria-hidden="true" /> Download
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="sketch-clipboard__actions">
        {prompt ? (
          <Button size="compact" variant="secondary" type="button" data-test="sketch-clipboard-copy-prompt" onClick={() => void copyPrompt()}>
            {copied ? <IconCheck size="var(--icon-size-small)" aria-hidden="true" /> : <IconCopy size="var(--icon-size-small)" aria-hidden="true" />}
            {copied ? "Copied" : "Copy prompt again"}
          </Button>
        ) : null}
        <Button size="compact" variant="primary" type="button" data-test="sketch-clipboard-mark-handed-off" onClick={() => void markHandedOff()}>
          <IconCheck size="var(--icon-size-small)" aria-hidden="true" /> Mark handed off
        </Button>
      </div>
      {error ? <span className="sketch-clipboard__error" role="status">{error}</span> : null}
    </StatusCallout>
  );
}
