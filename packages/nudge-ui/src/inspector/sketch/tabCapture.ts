/**
 * A host that can picture the visible tab without asking, such as the Chrome extension's `captureVisibleTab`. Without
 * one, screenshots ask the browser to share the screen.
 */
export interface TabCaptureSource {
  /** The whole visible tab at the size the browser delivers it; the caller crops and scales. */
  capture(): Promise<ImageBitmap>;
}

let configured: TabCaptureSource | null = null;

export function configureTabCaptureSource(source: TabCaptureSource | null): void {
  configured = source;
}

export function getTabCaptureSource(): TabCaptureSource | null {
  return configured;
}
