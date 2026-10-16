import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { nudgeUi } from "../../packages/nudge-ui/src/hosts/vite/index.ts";

const inspector = fileURLToPath(new URL("../../packages/nudge-ui/src/inspector", import.meta.url));
const portal = fileURLToPath(new URL("./src/portalContainer.ts", import.meta.url));

/** Adapt shadow-host CSS and portals only in the fixture module graph. */
function fixtureEnvironment(): Plugin {
  return {
    name: "inspector-workbench-environment",
    enforce: "pre",
    resolveId(source, importer) {
      if (source === "virtual:workbench-styles") return "\0virtual:workbench-styles";
      if (importer?.startsWith(inspector) && source.endsWith("/portalContainer.ts")) return portal;
      if (importer?.startsWith(inspector) && source.endsWith("/draftPreview.ts")) {
        return fileURLToPath(new URL("./src/fixtureDraftPreview.ts", import.meta.url));
      }
      return null;
    },
    load(id) {
      if (id !== "\0virtual:workbench-styles") return null;
      const manifest = resolve(inspector, "ui/styles.ts");
      this.addWatchFile(manifest);
      // Reuse the production stylesheet manifest, but retain Vite CSS source identities.
      const imports = [...readFileSync(manifest, "utf8").matchAll(/from "([^"]+\.css)\?inline"/g)];
      return imports.map((match) => `import ${JSON.stringify(resolve(inspector, "ui", match[1]!))};`).join("\n");
    },
    transform(code, id) {
      if (!id.startsWith(inspector) || !/\.css(?:$|\?)/.test(id) || !code.includes(":host")) return null;
      return { code: code.replaceAll(":host", ".workbench-preview"), map: null };
    },
  };
}

export default defineConfig({
  plugins: [fixtureEnvironment(), react(), nudgeUi({
    projectId: "inspector-workbench",
    sourceRoots: [inspector],
  }) as PluginOption],
  resolve: { alias: { "@inspector": inspector }, dedupe: ["react", "react-dom"] },
  server: { port: 5186, strictPort: true },
});
