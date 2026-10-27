import { describe, expect, it } from "vitest";
import {
  parseTabCaptureMessage,
  parseTabCaptureResponse,
  parseTabCaptureResult,
  TAB_CAPTURE_MESSAGE,
} from "./protocol.ts";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("tab capture messages", () => {
  it("recognizes only the capture request", () => {
    expect(parseTabCaptureMessage({ type: TAB_CAPTURE_MESSAGE })).toEqual({ type: TAB_CAPTURE_MESSAGE });
    expect(parseTabCaptureMessage({ type: "nudge-ui:font-list" })).toBeNull();
  });

  it("accepts a PNG data URL or an error from the service worker", () => {
    expect(parseTabCaptureResult({ dataUrl: PNG })).toEqual({ dataUrl: PNG });
    expect(parseTabCaptureResult({ error: "No activeTab" })).toEqual({ error: "No activeTab" });
    expect(parseTabCaptureResult({ dataUrl: "https://example.com/tab.png" })).toBeNull();
  });

  it("rejects a bridge reply carrying anything but a PNG", () => {
    expect(parseTabCaptureResponse(JSON.stringify({ id: 3, dataUrl: PNG }))).toEqual({ id: 3, dataUrl: PNG });
    expect(parseTabCaptureResponse(JSON.stringify({ id: 3, dataUrl: "data:text/html,<script>" }))).toBeNull();
    expect(parseTabCaptureResponse(JSON.stringify({ id: 3, error: "Not on screen" }))).toEqual({ id: 3, error: "Not on screen" });
  });
});
