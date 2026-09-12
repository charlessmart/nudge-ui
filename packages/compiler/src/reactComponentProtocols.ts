import type { ComponentModuleProtocols } from "./componentPolicyResolution.ts";

const PRESERVE = { wrap: false } as const;
const RENDERED_CHILDREN = { wrap: false, slots: { children: "rendered" } } as const;

/**
 * Adapter-independent React compatibility data.
 *
 * Library names live in this replaceable catalog rather than in compiler
 * control flow. Hosts may extend or replace these facts as their ecosystem
 * support grows.
 */
export const defaultReactComponentProtocols = {
  react: {
    default: PRESERVE,
    exports: {
      Fragment: RENDERED_CHILDREN,
      StrictMode: RENDERED_CHILDREN,
      Profiler: RENDERED_CHILDREN,
      Suspense: {
        wrap: false,
        slots: { children: "rendered", fallback: "rendered" },
      },
    },
  },
  "react-router": routerProtocols(),
  "react-router-dom": routerProtocols(),
} satisfies ComponentModuleProtocols;

function routerProtocols() {
  return {
    default: PRESERVE,
    exports: {
      BrowserRouter: RENDERED_CHILDREN,
      HashRouter: RENDERED_CHILDREN,
      MemoryRouter: RENDERED_CHILDREN,
      Router: RENDERED_CHILDREN,
      StaticRouter: RENDERED_CHILDREN,
      Routes: RENDERED_CHILDREN,
      Route: {
        wrap: false,
        slots: {
          children: "rendered",
          element: "rendered",
          errorElement: "rendered",
          hydrateFallbackElement: "rendered",
        },
      },
    },
  } as const;
}
