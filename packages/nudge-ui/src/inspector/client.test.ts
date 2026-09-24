// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveNudgeUiClientEntry,
  subscribeToManifestReloads,
} from "./client.ts";
import type { NudgeUiClientManifest } from "./clientManifest.ts";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, EventListener>();
  readonly close = vi.fn();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: EventListener): void {
    this.listeners.set(name, listener);
  }

  emitRevision(revision: number): void {
    this.listeners.get("message")?.(new MessageEvent("message", {
      data: JSON.stringify({ revision }),
    }));
  }
}

const manifest: NudgeUiClientManifest = {
  version: 1,
  revision: 0,
  runtime: {
    projectId: "reload-test",
    host: "nextjs-react",
    framework: "React",
    stylingSystem: "CSS custom properties",
    capabilities: { canvas: true, componentSemantics: true },
    tokenCatalog: [],
    tokens: [],
    tokenDiagnostics: [],
    tokenGeneration: "initial",
    componentContracts: [],
  },
  reload: {
    endpoint: "/__nudge_ui__/reload",
    strategy: "refresh-manifest",
  },
};

afterEach(() => {
  FakeEventSource.instances = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("subscribeToManifestReloads", () => {
  it("keeps the stream open and waits for a later revision after a refresh failure", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("temporary failure"));
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    subscribeToManifestReloads(manifest, "/__nudge_ui__/manifest");
    const source = FakeEventSource.instances[0]!;
    source.emitRevision(1);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(source.close).not.toHaveBeenCalled();

    source.emitRevision(1);
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);

    source.emitRevision(2);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("fetches a trailing revision announced during an in-flight refresh", async () => {
    let resolveFirst!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    const fetch = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(manifestResponse(2));
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("fetch", fetch);

    subscribeToManifestReloads(manifest, "/__nudge_ui__/manifest");
    const source = FakeEventSource.instances[0]!;
    source.emitRevision(1);
    source.emitRevision(2);
    expect(fetch).toHaveBeenCalledTimes(1);

    resolveFirst(manifestResponse(1));

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("applies document preparation from a refreshed manifest", async () => {
    const button = document.createElement("button");
    document.body.append(button);
    const refreshed: NudgeUiClientManifest = {
      ...manifest,
      revision: 1,
      runtime: {
        ...manifest.runtime,
        host: "static-html",
        framework: "HTML",
        capabilities: { canvas: true, componentSemantics: false },
      },
      document: { runtimeIdentity: "static-html" },
    };
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(refreshed))));

    subscribeToManifestReloads(manifest, "/__nudge_ui__/manifest");
    FakeEventSource.instances[0]!.emitRevision(1);

    await vi.waitFor(() => expect(button.dataset.cid).toMatch(/^nudge-ui-runtime-/));
    button.remove();
  });
});

describe("resolveNudgeUiClientEntry", () => {
  const application = { editorDocument: false, canvasRenderer: false };

  it("sends a top-level app into the editor while bootstrapping shell and renderer documents", () => {
    expect(resolveNudgeUiClientEntry(
      "https://example.test/catalog?category=chairs#oak",
      application,
    )).toEqual({
      kind: "redirect",
      href: createExpectedEditorUrl("/catalog?category=chairs#oak"),
    });
    expect(resolveNudgeUiClientEntry(
      "https://example.test/__nudge_ui__/editor?url=%2Fcatalog",
      { editorDocument: true, canvasRenderer: false },
    )).toEqual({ kind: "bootstrap" });
    expect(resolveNudgeUiClientEntry(
      "https://example.test/catalog",
      { editorDocument: false, canvasRenderer: true },
    )).toEqual({ kind: "bootstrap" });
    expect(resolveNudgeUiClientEntry(
      "https://example.test/catalog?__nudge_ui_direct=1",
      { editorDocument: false, canvasRenderer: true, automated: true },
    )).toEqual({ kind: "bootstrap" });
  });

  it("leaves an explicitly direct application view unmounted", () => {
    expect(resolveNudgeUiClientEntry(
      "https://example.test/catalog?__nudge_ui_direct=1",
      application,
    )).toEqual({ kind: "direct" });
    expect(resolveNudgeUiClientEntry(
      "https://example.test/catalog?nudge-ui=off",
      application,
    )).toEqual({ kind: "direct" });
    expect(resolveNudgeUiClientEntry(
      "https://example.test/another-route",
      { ...application, directTab: true },
    )).toEqual({ kind: "direct" });
  });

  it("keeps automated browsers on the plain app unless the tab or URL turns the editor on", () => {
    expect(resolveNudgeUiClientEntry(
      "https://example.test/catalog",
      { ...application, automated: true },
    )).toEqual({ kind: "automated", href: createExpectedEditorUrl("/catalog") });
    expect(resolveNudgeUiClientEntry(
      "https://example.test/catalog?nudge-ui=on",
      { ...application, automated: true, directTab: true },
    )).toEqual({ kind: "redirect", href: createExpectedEditorUrl("/catalog") });
    expect(resolveNudgeUiClientEntry(
      "https://example.test/catalog",
      { ...application, automated: true, forcedTab: true },
    )).toEqual({ kind: "redirect", href: createExpectedEditorUrl("/catalog") });
  });
});

function createExpectedEditorUrl(target: string): string {
  const url = new URL(target, "https://example.test");
  url.searchParams.append("nudge-ui", "editor");
  return url.href;
}

function manifestResponse(revision: number): Response {
  return new Response(JSON.stringify({
    ...manifest,
    revision,
    runtime: { ...manifest.runtime, tokenGeneration: `revision-${revision}` },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
