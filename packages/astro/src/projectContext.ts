import type { Plugin } from "vite";

const VIRTUAL_CONTEXT_ID = "virtual:design-tool-astro-context";
const RESOLVED_CONTEXT_ID = `\0${VIRTUAL_CONTEXT_ID}`;

/**
 * Supplies the dev-only server context (project root) to the instrumentation
 * middleware through a virtual module.
 *
 * The middleware entrypoint is loaded by Astro's SSR pipeline, where no
 * integration hook argument is available; the Vite-resolved project root is
 * therefore published as a module value instead of being read from ambient
 * process state.
 */
export function createProjectContextPlugin(): Plugin {
  let projectRoot: string | undefined;

  return {
    name: "design-tool-astro-context",
    apply: "serve",
    configResolved(config) {
      projectRoot = config.root;
    },
    resolveId(id) {
      if (id === VIRTUAL_CONTEXT_ID || id === RESOLVED_CONTEXT_ID) {
        return RESOLVED_CONTEXT_ID;
      }
      return null;
    },
    load(id) {
      if (id !== RESOLVED_CONTEXT_ID) return null;
      // An empty root degrades to undefined so annotation paths forward
      // unchanged instead of relativizing against the wrong base.
      return `export const projectRoot = ${JSON.stringify(projectRoot ?? "")};\n`;
    },
  };
}
