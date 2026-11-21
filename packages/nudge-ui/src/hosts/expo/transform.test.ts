import { describe, expect, it } from "vitest";
import {
  EXPO_TRANSFORM_SETTINGS_ENV,
  readExpoTransformSettings,
  transformExpoModuleSource,
  type ExpoTransformSettings,
} from "./transform.ts";

const SETTINGS: ExpoTransformSettings = {
  root: "/work/rider",
  sourceRoots: ["/work/shared-ui"],
  packageRoot: "/work/nudge-ui",
  primitiveModules: ["react-native"],
};
const WEB = { dev: true, platform: "web" } as const;

const CARD = `import { View } from "react-native";
import { Badge } from "./Badge";
export function RideCard() {
  return <View><Badge /></View>;
}
`;

describe("Expo module transform", () => {
  it("instruments project JSX in the web development bundle", () => {
    const code = transformExpoModuleSource(CARD, "/work/rider/components/RideCard.tsx", WEB, SETTINGS);

    expect(code).toContain(`<View dataSet={{cid:"RideCard",src:"components/RideCard.tsx:4:11"}}>`);
    expect(code).toContain(`<Badge data-cid="Badge" data-src="components/RideCard.tsx:4:17"`);
    expect(code).toContain(`from "nudge-ui/internal/component-runtime"`);
  });

  it("keeps every authored line where it was", () => {
    const code = transformExpoModuleSource(CARD, "/work/rider/components/RideCard.tsx", WEB, SETTINGS) ?? "";

    expect(code.split("\n")).toHaveLength(CARD.split("\n").length);
    expect(code.split("\n")[0]).toMatch(/^import \{ registerReactCallsites as __nudgeUiRegisterCallsites \}.*import \{ View \} from "react-native";$/);
  });

  it("puts the runtime binding after a directive prologue", () => {
    const source = `"use client";\n${CARD}`;
    const code = transformExpoModuleSource(source, "/work/rider/components/RideCard.tsx", WEB, SETTINGS) ?? "";

    expect(code.startsWith(`"use client";import { registerReactCallsites`)).toBe(true);
  });

  it("never instruments native platforms or production bundles", () => {
    const file = "/work/rider/components/RideCard.tsx";
    expect(transformExpoModuleSource(CARD, file, { dev: true, platform: "ios" }, SETTINGS)).toBeNull();
    expect(transformExpoModuleSource(CARD, file, { dev: true, platform: "android" }, SETTINGS)).toBeNull();
    expect(transformExpoModuleSource(CARD, file, { dev: false, platform: "web" }, SETTINGS)).toBeNull();
  });

  it("gives server renders identity without the browser runtime", () => {
    const code = transformExpoModuleSource(
      CARD,
      "/work/rider/app/index.tsx",
      { ...WEB, environment: "node" },
      SETTINGS,
    ) ?? "";

    expect(code).toContain("dataSet={{cid:");
    expect(code).not.toContain("nudge-ui/internal/component-runtime");
  });

  it("instruments declared source roots and skips dependencies and Nudge UI itself", () => {
    expect(transformExpoModuleSource(CARD, "/work/shared-ui/Card.tsx", WEB, SETTINGS)).toContain("dataSet");
    expect(transformExpoModuleSource(CARD, "/work/rider/node_modules/lib/Card.tsx", WEB, SETTINGS)).toBeNull();
    expect(transformExpoModuleSource(CARD, "/work/nudge-ui/src/Card.tsx", WEB, SETTINGS)).toBeNull();
    expect(transformExpoModuleSource(CARD, "/work/elsewhere/Card.tsx", WEB, SETTINGS)).toBeNull();
    expect(transformExpoModuleSource("export const a = 1;", "/work/rider/lib/a.ts", WEB, SETTINGS)).toBeNull();
  });

  it("imports the bootstrap so Metro keeps it in the graph", () => {
    const code = transformExpoModuleSource(CARD, "/work/rider/components/RideCard.tsx", WEB, {
      ...SETTINGS,
      bootstrap: "/work/rider/.nudge/expo/bootstrap.js",
    }) ?? "";

    expect(code.startsWith(`import "/work/rider/.nudge/expo/bootstrap.js";`)).toBe(true);
  });

  it("reads its settings from the environment and ignores malformed values", () => {
    expect(readExpoTransformSettings({ [EXPO_TRANSFORM_SETTINGS_ENV]: JSON.stringify(SETTINGS) })).toEqual({
      ...SETTINGS,
      bootstrap: null,
    });
    expect(readExpoTransformSettings({ [EXPO_TRANSFORM_SETTINGS_ENV]: "{" })).toBeNull();
    expect(readExpoTransformSettings({ [EXPO_TRANSFORM_SETTINGS_ENV]: "{}" })).toBeNull();
    expect(readExpoTransformSettings({})).toBeNull();
  });
});
