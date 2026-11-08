import {
  collectPackageComponentImports,
  defaultReactComponentProtocols,
  extractComponentCatalog,
  extractPackageComponentContractCatalog,
  injectIdentity,
  resolveHostComponentPolicy,
} from "../../compiler/index.ts";
import { REACT_RENDERER_CAPTURE_SCRIPT } from "../reactRendererCapture.ts";
import type { ComponentFrameworkAdapter } from "./adapter.ts";
import { createWorkerRunner } from "./typeAwareContracts.ts";

export const REACT_COMPONENT_RUNTIME_MODULE = "nudge-ui/internal/component-runtime";
export const REACT_COMPONENT_SHEET_RUNTIME_MODULE = "nudge-ui/internal/component-sheet";

/** Modules a sheet cannot load in the browser: they declare themselves server-only, read request state, or export server metadata. */
const SERVER_ONLY_IMPORT = /\bimport\s*(?:[\w*${}\s,]+?\s*from\s*)?["'](?:server-only|next\/headers|next\/cache)["']/;
const SERVER_ONLY_EXPORT = /\bexport\s+(?:const|let|var|async\s+function|function)\s+(?:metadata|generateMetadata|generateStaticParams|generateViewport|viewport|revalidate|dynamic)\b/;
const SERVER_DIRECTIVE = /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use server["']/;

export const reactComponentFramework: ComponentFrameworkAdapter = {
  id: "react",
  label: "React",
  sourceFile: /\.(?:tsx|jsx)(?:$|[?#])/,
  // Instrumented callsites must use the application's own React, not a linked or nested copy.
  singletonPackages: ["react", "react-dom"],
  singletonSpecifiers: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom/client"],
  runtimeModules: {
    components: REACT_COMPONENT_RUNTIME_MODULE,
    sheet: REACT_COMPONENT_SHEET_RUNTIME_MODULE,
  },
  /** Lets live preview reach React's renderer, which loads before any module the host controls. */
  documentHeadScript: REACT_RENDERER_CAPTURE_SCRIPT,
  sheetWrapperFiles: ["nudge.sheet.tsx", "nudge.sheet.jsx", "nudge.sheet.ts", "nudge.sheet.js"],
  defaultProtocols: defaultReactComponentProtocols,

  instrument(code, id, root, options) {
    return injectIdentity(code, id, root, {
      instrumentComponents: options.instrumentComponents,
      hostPolicy: options.hostPolicy,
      componentRuntimeModule: options.componentRuntimeModule ?? REACT_COMPONENT_RUNTIME_MODULE,
    });
  },
  resolvePolicy: resolveHostComponentPolicy,
  extractFileContracts: extractComponentCatalog,
  collectPackageImports: collectPackageComponentImports,
  extractPackageContracts(hostFile, imports) {
    return extractPackageComponentContractCatalog({ hostFile, imports });
  },
  createTypeAwareRunner() {
    // Same relative layout in source and in dist; only the extension differs.
    return createWorkerRunner(new URL(
      `../../compiler/projectComponentContractsWorker${import.meta.url.endsWith(".ts") ? ".ts" : ".js"}`,
      import.meta.url,
    ));
  },
  isServerOnlyModule(code) {
    return SERVER_ONLY_IMPORT.test(code) || SERVER_ONLY_EXPORT.test(code) || SERVER_DIRECTIVE.test(code);
  },
};
