import { describe, expect, it } from "vitest";
import { injectIdentity } from "./reactIdentity.ts";

const PRIMITIVES = { primitiveModules: ["react-native"] } as const;

describe("React identity for platform primitives", () => {
  it("writes identity into dataSet and names the enclosing component", () => {
    const code = `import { View, Text, StyleSheet } from "react-native";
export function RideCard() {
  return <View style={styles.card}><Text testID="title">Ride</Text></View>;
}
const styles = StyleSheet.create({ card: {} });`;
    const result = injectIdentity(code, "/app/components/RideCard.tsx", "/app", PRIMITIVES);

    expect(result?.code).toContain(`<View dataSet={{cid:"RideCard",src:"components/RideCard.tsx:3:11"}} style`);
    expect(result?.code).toContain(`<Text dataSet={{cid:"RideCard",src:"components/RideCard.tsx:3:37",cprops:"testID:title"}} testID`);
    expect(result?.code).not.toContain("data-cid");
  });

  it("keeps authored dataSet keys over injected ones", () => {
    const code = `import { View } from "react-native";
export const Row = () => <View dataSet={{ cid: "mine", tone }} />;`;
    const result = injectIdentity(code, "/app/Row.tsx", "/app", PRIMITIVES);

    expect(result?.code).toContain(`dataSet={{cid:"Row",src:"Row.tsx:2:27",...({ cid: "mine", tone })}}`);
  });

  it("treats namespaced primitives such as Animated.View as host elements", () => {
    const code = `import { Animated } from "react-native";
export const Fade = () => <Animated.View />;`;
    const result = injectIdentity(code, "/app/Fade.tsx", "/app", { ...PRIMITIVES, instrumentComponents: true });

    expect(result?.code).toContain(`<Animated.View dataSet={{cid:"Fade",src:"Fade.tsx:2:28"}} />`);
    expect(result?.code).not.toContain("registerReactCallsites");
  });

  it("does not register primitives as component callsites but still registers project components", () => {
    const code = `import { View } from "react-native";
import { Badge } from "./Badge";
export const Row = () => <View><Badge tone="good" /></View>;`;
    const result = injectIdentity(code, "/app/Row.tsx", "/app", { ...PRIMITIVES, instrumentComponents: true });

    expect(result?.code).toContain(`<Badge data-cid="Badge" data-src="Row.tsx:3:33"`);
    const registration = /__nudgeUiRegisterCallsites\((.*)\);/.exec(result?.code ?? "")?.[1] ?? "[]";
    const names = (JSON.parse(registration) as Array<{ componentName: string }>).map((meta) => meta.componentName);
    expect(names).toEqual(["Badge"]);
  });

  it("leaves elements from other modules on the data-attribute path", () => {
    const code = `import { Image } from "expo-image";
export const Cover = () => <Image />;`;
    const result = injectIdentity(code, "/app/Cover.tsx", "/app", PRIMITIVES);

    expect(result?.code).toContain(`<Image data-cid="Image" data-src="Cover.tsx:2:29" />`);
  });
});
