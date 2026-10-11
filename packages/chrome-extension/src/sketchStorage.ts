import type {
  SketchDocument,
  SketchHandoffRecord,
  SketchPersistenceSnapshot,
  SketchStorage,
  SketchStorageChange,
} from "nudge-ui/internal/page-inspector";
import {
  SKETCH_REQUEST_EVENT,
  SKETCH_RESPONSE_EVENT,
  type SketchRequest,
  type SketchResponse,
  type StoredImage,
  type StoredSketchDocument,
  type StoredSketchRecords,
} from "./protocol.ts";

// Distributes over the union so each request keeps its own fields.
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
  const [originalImage, annotatedImage] = await Promise.all([
    encodeImage(document.originalImage),
    encodeImage(document.annotatedImage),
  ]);
  return { ...document, originalImage, annotatedImage };
}

// The store validates every hydrated document, so malformed records are dropped there.
function decodeDocument(document: StoredSketchDocument): SketchDocument {
  return {
    ...document,
    originalImage: decodeImage(document.originalImage),
    annotatedImage: decodeImage(document.annotatedImage),
  } as unknown as SketchDocument;
}

/**
 * Persists sketches to extension storage through the isolated-world bridge,
 * so the inspected site's IndexedDB is never written. Requests cross the
 * world boundary as JSON strings, like inspector storage writes.
 */
export function createExtensionSketchStorage(): SketchStorage {
  let nextId = 0;
  const pending = new Map<number, (response: SketchResponse) => void>();
  document.addEventListener(SKETCH_RESPONSE_EVENT, (event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (typeof detail !== "string") return;
    let response: SketchResponse;
    try {
      response = JSON.parse(detail) as SketchResponse;
    } catch {
      return;
    }
    const settle = pending.get(response.id);
    pending.delete(response.id);
    settle?.(response);
  });

  const send = (body: RequestBody): Promise<SketchResponse & { ok: true }> => new Promise((resolve, reject) => {
    nextId += 1;
    const request = { ...body, id: nextId } as SketchRequest;
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
        try {
          documents.push(decodeDocument(document));
        } catch {
          // A corrupt image drops only its own sketch.
        }
      }
      const handoffs = (records?.handoffs ?? []) as unknown as SketchHandoffRecord[];
      return {
        documents: documents.filter((document) => document.projectId === projectId),
        handoffs: handoffs.filter((handoff) => handoff.projectId === projectId),
      };
    },
    async update(_projectId: string, change: SketchStorageChange): Promise<void> {
      const documents = await Promise.all((change.documents ?? []).map(encodeDocument));
      await send({
        op: "update",
        put: { documents, handoffs: [...(change.handoffs ?? [])] as unknown as StoredSketchRecords["handoffs"] },
        deleteDocumentIds: [...(change.deleteDocumentIds ?? [])],
        deleteHandoffIds: [...(change.deleteHandoffIds ?? [])],
      });
    },
  };
}
