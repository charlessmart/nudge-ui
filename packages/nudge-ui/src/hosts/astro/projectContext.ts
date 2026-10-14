import type { Plugin } from "vite";

const VIRTUAL_CONTEXT_ID = "virtual:nudge-ui-astro-context";
const RESOLVED_CONTEXT_ID = `\0${VIRTUAL_CONTEXT_ID}`;

/** The middleware entrypoint has no integration hook argument, so the Vite-resolved root is published as a module value. */
export function createProjectContextPlugin(): Plugin {
  let projectRoot: string | undefined;

  return {
    name: "nudge-ui-astro-context",
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
      // Empty root degrades to undefined so annotation paths stay unchanged.
      return `export const projectRoot = ${JSON.stringify(projectRoot ?? "")};\n`;
    },
  };
}
