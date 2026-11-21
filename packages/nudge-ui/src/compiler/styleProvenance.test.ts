import { describe, expect, it } from "vitest";
import { injectIdentity } from "./reactIdentity.ts";
import { cssPropertyForStyleKey } from "./styleProvenance.ts";
import { parseStyleProvenance, type StyleProvenance } from "./styleProvenanceFormat.ts";

const PRIMITIVES = { primitiveModules: ["react-native"] } as const;

function primitiveProvenance(code: string): StyleProvenance[] {
  const output = injectIdentity(code, "/app/Screen.tsx", "/app", PRIMITIVES)?.code ?? "";
  return [...output.matchAll(/cstyle:("(?:[^"\\]|\\.)*")/g)].map((match) =>
    parseStyleProvenance(JSON.parse(match[1]!) as string)!);
}

function domProvenance(code: string): StyleProvenance[] {
  const output = injectIdentity(code, "/app/Page.tsx", "/app")?.code ?? "";
  return [...output.matchAll(/data-cstyle="([^"]*)"/g)].map((match) =>
    parseStyleProvenance(match[1]!.replaceAll("&quot;", "\"").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&"))!);
}

describe("style provenance", () => {
  it("records literal and expression members, skipping StyleSheet entries", () => {
    const [provenance] = primitiveProvenance(`import { View, StyleSheet } from "react-native";
export function Card({ colors }) {
  return <View style={[styles.card, StyleSheet.absoluteFill, { paddingHorizontal: 4, backgroundColor: colors.card, top: -2 }]} />;
}
const styles = StyleSheet.create({ card: { flex: 1 } });`);

    expect(provenance).toEqual({
      props: {
        "padding-inline": ["literal", "4", "paddingHorizontal"],
        "background-color": ["expression", "colors.card", "backgroundColor"],
        top: ["literal", "-2", "top"],
      },
      opaque: [],
    });
  });

  it("treats conditional members as expressions", () => {
    const [provenance] = primitiveProvenance(`import { View } from "react-native";
export const Row = ({ on }) => <View style={[on && { opacity: 0.5 }, on ? { width: 10 } : null]} />;`);

    expect(provenance?.props).toEqual({
      opacity: ["expression", "0.5", "opacity"],
      width: ["expression", "10", "width"],
    });
  });

  it("reads expression bodies of style functions and marks other values opaque", () => {
    const [pressable, text] = primitiveProvenance(`import { Pressable, Text } from "react-native";
import { font } from "./theme";
export const Button = ({ extra }) => <Pressable style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
  <Text style={[font.body, extra, { ...shared }]}>Go</Text>
</Pressable>;`);

    expect(pressable).toEqual({ props: { opacity: ["expression", "pressed ? 0.5 : 1", "opacity"] }, opaque: [] });
    expect(text).toEqual({ props: {}, opaque: ["font.body", "extra", "shared"] });
  });

  it("emits nothing for elements whose styles all compile to classes", () => {
    const output = injectIdentity(`import { View, StyleSheet } from "react-native";
export const Box = () => <View style={styles.box} />;
const styles = StyleSheet.create({ box: { flex: 1 } });`, "/app/Box.tsx", "/app", PRIMITIVES)?.code;

    expect(output).not.toContain("cstyle");
  });

  it("writes data-cstyle on DOM elements but not on components", () => {
    const code = `export const Page = ({ c }) => <main style={{ width: 30, color: c, "--gap": "4px", WebkitLineClamp: 2 }}><Card style={{ width: 1 }} /></main>;`;
    const provenance = domProvenance(code);

    expect(provenance).toEqual([{
      props: {
        width: ["literal", "30", "width"],
        color: ["expression", "c", "color"],
        "--gap": ["literal", "\"4px\"", "--gap"],
        "-webkit-line-clamp": ["literal", "2", "WebkitLineClamp"],
      },
      opaque: [],
    }]);
  });

  it("maps React Native keys to the CSS names react-native-web writes", () => {
    expect(cssPropertyForStyleKey("marginVertical")).toBe("margin-block");
    expect(cssPropertyForStyleKey("paddingStart")).toBe("padding-inline-start");
    expect(cssPropertyForStyleKey("borderTopLeftRadius")).toBe("border-top-left-radius");
    expect(cssPropertyForStyleKey("msTransform")).toBe("-ms-transform");
  });
});
