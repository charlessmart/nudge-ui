import type { ChannelProtocol } from "./bridge.ts";
import {
  FONT_LIST_REQUEST_EVENT,
  FONT_LIST_RESPONSE_EVENT,
  parseFontListResponse,
  parseStorageReadResponse,
  STORAGE_READ_EVENT,
  STORAGE_READ_RESPONSE_EVENT,
  TAB_CAPTURE_REQUEST_EVENT,
  TAB_CAPTURE_RESPONSE_EVENT,
  parseTabCaptureResponse,
  type FontListResponse,
  type StorageReadResponse,
  type TabCaptureResponse,
} from "./protocol.ts";

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

/** A picture of the visible tab for sketch screenshots, which only the service worker can take. */
export const tabCaptureChannel: ChannelProtocol<EmptyRequest, TabCaptureResponse> = {
  name: "Tab capture",
  request: TAB_CAPTURE_REQUEST_EVENT,
  response: TAB_CAPTURE_RESPONSE_EVENT,
  encodeRequest: ({ id }) => id,
  decodeRequest: decodeEmptyRequest,
  encodeReply: (reply) => JSON.stringify(reply),
  decodeReply: parseTabCaptureResponse,
  encodeFailure: (id, error) => ({ id, error: error.message }),
};
