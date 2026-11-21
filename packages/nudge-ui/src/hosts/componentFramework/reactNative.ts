import { injectIdentity } from "../../compiler/index.ts";
import type { ComponentFrameworkAdapter } from "./adapter.ts";
import { REACT_COMPONENT_RUNTIME_MODULE, reactComponentFramework } from "./react.ts";

/** Modules whose exports render platform elements on react-native-web rather than authored components. */
export const REACT_NATIVE_PRIMITIVE_MODULES: readonly string[] = ["react-native", "react-native-web"];

/**
 * React Native on the web. The runtime is React's (fibers, the DevTools seam), so `id` stays `"react"`; what differs is
 * that platform elements are imported components whose identity must travel through `dataSet`, and that their huge
 * prop surfaces are not component contracts.
 */
export function createReactNativeComponentFramework(
  primitiveModules: readonly string[] = REACT_NATIVE_PRIMITIVE_MODULES,
): ComponentFrameworkAdapter {
  const primitive = new Set(primitiveModules);
  return {
    ...reactComponentFramework,
    label: "React Native",
    // Metro has no sheet entry yet; the library lists components but opens no sheets.
    runtimeModules: { components: REACT_COMPONENT_RUNTIME_MODULE, sheet: null },
    instrument(code, id, root, options) {
      return injectIdentity(code, id, root, {
        instrumentComponents: options.instrumentComponents,
        hostPolicy: options.hostPolicy,
        componentRuntimeModule: options.componentRuntimeModule ?? REACT_COMPONENT_RUNTIME_MODULE,
        primitiveModules,
      });
    },
    collectPackageImports(code, file) {
      return reactComponentFramework.collectPackageImports(code, file)
        .filter((entry) => !primitive.has(entry.moduleSpecifier));
    },
  };
}

export const reactNativeComponentFramework = createReactNativeComponentFramework();
