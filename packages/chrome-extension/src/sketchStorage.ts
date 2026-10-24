import {
  isSketchDocument,
  type SketchDocument,
  type SketchPersistenceSnapshot,
  type SketchStorage,
  type SketchStorageChange,
} from "nudge-ui/internal/page-inspector";
import {
  parseSketchResponse,
  SKETCH_REQUEST_EVENT,
  SKETCH_RESPONSE_EVENT,
  type SketchRequest,
  type SketchResponse,
  type StoredImage,
  type StoredSketchDocument,
} from "./protocol.ts";

// Distributive so each request keeps its own fields.
type RequestBody<Request = SketchRequest> = Request extends unknown ? Omit<Request, "id"> : never;

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

/** Persists sketches through the isolated-world bridge so the inspected site's own storage is never written. */
export function createExtensionSketchStorage(): SketchStorage {
  let nextId = 0;
  const pending = new Map<number, (response: SketchResponse) => void>();
  document.addEventListener(SKETCH_RESPONSE_EVENT, (event) => {
    const response = parseSketchResponse((event as CustomEvent<unknown>).detail);
    if (!response) return;
    const settle = pending.get(response.id);
    pending.delete(response.id);
    settle?.(response);
  });

  const send = (body: RequestBody): Promise<SketchResponse & { ok: true }> => new Promise((resolve, reject) => {
    nextId += 1;
    const request: SketchRequest = { ...body, id: nextId };
    pending.set(request.id, (response) => {
      if (response.ok) resolve(response);
      else reject(new Error(response.error));
    });
    document.dispatchEvent(new CustomEvent(SKETCH_REQUEST_EVENT, { detail: JSON.stringify(request) }));
  });

  return {
    async read(projectId: string): Promise<SketchPersistenceSnapshot> {
      const { records } = await send({ op: "read" });
      const documents: SketchDocument[] = [];
      for (const document of records?.documents ?? []) {
        const decoded = decodeDocument(document);
        if (decoded && decoded.projectId === projectId) documents.push(decoded);
      }
      return { documents };
    },
    async update(_projectId: string, change: SketchStorageChange): Promise<void> {
      const documents = await Promise.all((change.documents ?? []).map(encodeDocument));
      await send({
        op: "update",
        put: { documents },
        deleteDocumentIds: [...(change.deleteDocumentIds ?? [])],
      });
    },
  };
}
