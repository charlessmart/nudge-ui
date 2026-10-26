import type { ChannelProtocol } from "./bridge.ts";
import {
  FONT_LIST_REQUEST_EVENT,
  FONT_LIST_RESPONSE_EVENT,
  parseFontListResponse,
  parseSketchRequest,
  parseSketchResponse,
  parseStorageReadResponse,
  SKETCH_REQUEST_EVENT,
  SKETCH_RESPONSE_EVENT,
  STORAGE_READ_EVENT,
  STORAGE_READ_RESPONSE_EVENT,
  type FontListResponse,
  type SketchRequest,
  type SketchResponse,
  type StorageReadResponse,
} from "./protocol.ts";

// Distributive so each request keeps its own fields.
type RequestBody<Request = SketchRequest> = Request extends unknown ? Omit<Request, "id"> : never;

/** A sketch request without its channel id. */
export type SketchRequestBody = RequestBody;

type EmptyRequest = Record<never, never>;

function isRequestId(detail: unknown): detail is number {
  return typeof detail === "number" && Number.isSafeInteger(detail);
}

function decodeEmptyRequest(detail: unknown): { id: number } | null {
  return isRequestId(detail) ? { id: detail } : null;
}

/** The inspector's saved state for this origin, read when the inspector boots. */
export const storageReadChannel: ChannelProtocol<EmptyRequest, StorageReadResponse> = {
  name: "Inspector storage",
  request: STORAGE_READ_EVENT,
  response: STORAGE_READ_RESPONSE_EVENT,
  encodeRequest: ({ id }) => id,
  decodeRequest: decodeEmptyRequest,
  encodeReply: (reply) => JSON.stringify(reply),
  decodeReply: parseStorageReadResponse,
  encodeFailure: (id, error) => ({ id, error: error.message }),
};

/** Recent sketch images, which are too large to travel with the rest of the inspector state. */
export const sketchChannel: ChannelProtocol<RequestBody, SketchResponse> = {
  name: "Sketch storage",
  request: SKETCH_REQUEST_EVENT,
  response: SKETCH_RESPONSE_EVENT,
  encodeRequest: (request) => JSON.stringify(request),
  decodeRequest: parseSketchRequest,
  encodeReply: (reply) => JSON.stringify(reply),
  decodeReply: parseSketchResponse,
  encodeFailure: (id, error) => ({ id, ok: false, error: error.message }),
};

/** The installed font families, which only the service worker can list. */
export const fontListChannel: ChannelProtocol<EmptyRequest, FontListResponse> = {
  name: "The font list",
  request: FONT_LIST_REQUEST_EVENT,
  response: FONT_LIST_RESPONSE_EVENT,
  encodeRequest: ({ id }) => id,
  decodeRequest: decodeEmptyRequest,
  encodeReply: (reply) => JSON.stringify(reply),
  decodeReply: parseFontListResponse,
  encodeFailure: (id, error) => ({ id, error: error.message }),
};
