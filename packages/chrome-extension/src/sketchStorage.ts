import {
  isSketchDocument,
  type SketchDocument,
  type SketchPersistenceSnapshot,
  type SketchStorage,
  type SketchStorageChange,
} from "nudge-ui/internal/page-inspector";
import { createChannelClient } from "./bridge.ts";
import { sketchChannel } from "./channels.ts";
import type { SketchResponse, StoredImage, StoredSketchDocument } from "./protocol.ts";

// Bounds String.fromCharCode's argument count.
const ENCODE_CHUNK = 0x8000;

async function encodeImage(blob: Blob): Promise<StoredImage> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += ENCODE_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + ENCODE_CHUNK));
  }
  return { type: blob.type, base64: btoa(binary) };
}

function decodeImage(image: StoredImage): Blob {
  const binary = atob(image.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: image.type });
}

async function encodeDocument(document: SketchDocument): Promise<StoredSketchDocument> {
  return { ...document, image: await encodeImage(document.image) };
}

// A corrupt image or invalid record drops only its own sketch.
function decodeDocument(document: StoredSketchDocument): SketchDocument | null {
  try {
    const decoded = { ...document, image: decodeImage(document.image) };
    return isSketchDocument(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function assertOk(response: SketchResponse): asserts response is Extract<SketchResponse, { ok: true }> {
  if (!response.ok) throw new Error(response.error);
}

/** Persists sketches through the isolated-world bridge so the inspected site's own storage is never written. */
export function createExtensionSketchStorage(): SketchStorage {
  const client = createChannelClient(sketchChannel);
  return {
    async read(projectId: string): Promise<SketchPersistenceSnapshot> {
      const response = await client.send({ op: "read" });
      assertOk(response);
      const documents: SketchDocument[] = [];
      for (const document of response.records?.documents ?? []) {
        const decoded = decodeDocument(document);
        if (decoded && decoded.projectId === projectId) documents.push(decoded);
      }
      return { documents };
    },
    async update(_projectId: string, change: SketchStorageChange): Promise<void> {
      const documents = await Promise.all((change.documents ?? []).map(encodeDocument));
      const response = await client.send({
        op: "update",
        put: { documents },
        deleteDocumentIds: [...(change.deleteDocumentIds ?? [])],
      });
      assertOk(response);
    },
  };
}
