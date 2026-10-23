import { describe, expect, it } from "vitest";
import {
  createNudgeUiClientManifest,
  NUDGE_UI_CLIENT_MANIFEST_VERSION,
  parseNudgeUiClientManifest,
  type NudgeUiClientManifest,
} from "../inspector/clientManifest.ts";
import { NUDGE_UI_MANIFEST_VERSION, NUDGE_UI_ROUTE_PREFIX } from "../transport/index.ts";
import { createStandaloneRuntimeManifest } from "./static/manifest.ts";
import { buildManifest } from "./next/manifest.ts";

interface HostCase {
  readonly name: string;
  readonly build: () => NudgeUiClientManifest;
}

// Every host that builds a manifest without a running development server is listed here. The table is the conformance contract: a new host adds one row.
const HOSTS: readonly HostCase[] = [
  {
    name: "static-html",
    build: () => createStandaloneRuntimeManifest("static-html:conformance"),
  },
  {
    name: "nextjs-react",
    build: () => buildManifest({ root: "/tmp/nudge-ui-conformance" }),
  },
];

describe("client manifest conformance", () => {
  it("keeps one envelope version across transport and client", () => {
    expect(NUDGE_UI_CLIENT_MANIFEST_VERSION).toBe(NUDGE_UI_MANIFEST_VERSION);
  });

  it.each(HOSTS)("$name publishes a parseable envelope", ({ build }) => {
    const manifest = build();
    expect(manifest.version).toBe(NUDGE_UI_MANIFEST_VERSION);
    expect(Number.isInteger(manifest.revision)).toBe(true);
    expect(manifest.revision).toBeGreaterThanOrEqual(0);
    expect(parseNudgeUiClientManifest(manifest)).not.toBeNull();
  });

  it.each(HOSTS)("$name declares plain-data runtime capabilities", ({ build }) => {
    const { runtime } = build();
    expect(runtime.projectId.length).toBeGreaterThan(0);
    expect(typeof runtime.capabilities.canvas).toBe("boolean");
    expect(typeof runtime.capabilities.domNavigation).toBe("boolean");
    expect(typeof runtime.capabilities.componentSemantics).toBe("boolean");
  });

  it.each(HOSTS)("$name publishes a coherent reload capability", ({ build }) => {
    const reload = build().reload;
    if (!reload) return;
    expect(reload.endpoint.startsWith(NUDGE_UI_ROUTE_PREFIX)).toBe(true);
    expect(["refresh-manifest", "reload-document"]).toContain(reload.strategy);
    // A document reload only completes when the host announces the events that settle a save; refresh-manifest hosts rebuild the manifest instead.
    if (reload.strategy === "reload-document") {
      expect(reload.events?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("round-trips through the untrusted parser", () => {
    for (const { build } of HOSTS) {
      const manifest = build();
      expect(parseNudgeUiClientManifest(manifest)).toMatchObject({
        version: NUDGE_UI_MANIFEST_VERSION,
        revision: manifest.revision,
        runtime: { host: manifest.runtime.host },
      });
    }
  });

  it("rejects an envelope from a different version", () => {
    const manifest = createStandaloneRuntimeManifest("static-html:conformance");
    expect(parseNudgeUiClientManifest({ ...manifest, version: manifest.version + 1 })).toBeNull();
  });

  it("omits optional capabilities rather than publishing empty objects", () => {
    const runtime = createStandaloneRuntimeManifest("static-html:conformance").runtime;
    const manifest = createNudgeUiClientManifest({ runtime });
    expect(manifest.revision).toBe(0);
    expect("reload" in manifest).toBe(false);
    expect("document" in manifest).toBe(false);
    expect("agentBridge" in manifest).toBe(false);
    expect("inspectAutomatedBrowsers" in manifest).toBe(false);
  });
});
