import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
// Load the workspace source directly so Vite's config bundler does not ask
// Node to execute the package's unbundled .ts entry during Playwright startup.
import { nudgeUi } from "../../packages/nudge-ui/src/hosts/vite/index.ts";
import { NUDGE_UI_CLIENT_PATH } from "../../packages/nudge-ui/src/transport/routes.ts";

function nudgeUiSource(path: string): string {
  return fileURLToPath(new URL(`../../packages/nudge-ui/src/${path}`, import.meta.url));
}

/** Serves inspector source through Vite for sandbox HMR and React Refresh. */
function liveSourcePlugin(): Plugin {
  return {
    name: "sandbox-live-source",
    apply: "serve",
    // Run after nudge-ui's config hook so workspace aliases take precedence.
    config() {
      return {
        resolve: {
          alias: [
            { find: "nudge-ui/testing", replacement: nudgeUiSource("inspector/testing.ts") },
            {
              find: "nudge-ui/internal/component-runtime",
              replacement: nudgeUiSource("inspector/componentSemantics/reactRuntime.tsx"),
            },
          ],
        },
        // These entries keep the aliased modules in Vite's module graph
        // instead of the dep optimizer, so edits hot-update.
        optimizeDeps: { exclude: ["nudge-ui/testing", "nudge-ui/internal/component-runtime"] },
      };
    },
    configureServer: {
      // Rewrite the entry before nudge-ui's middleware serves the dist bundle.
      order: "pre",
      handler(server) {
        server.middlewares.use((request, _response, next) => {
          const url = new URL(request.url ?? "/", "http://sandbox.local");
          if (url.pathname === NUDGE_UI_CLIENT_PATH && request.method === "GET") {
            request.url = `/@fs/${nudgeUiSource("inspector/client.ts")}${url.search}`;
          }
          next();
        });
      },
    },
  };
}

export default defineConfig({
  // nudge-ui/vite is a workspace package with Vite in its own dependency
  // graph. The cast keeps Vite's plugin typing local to this app's Vite instance.
  // SAFETY: nudgeUi returns Plugin[]; this app accepts it as a PluginOption after the local Vite type mismatch.
  plugins: [react(), nudgeUi() as PluginOption, liveSourcePlugin()],
  server: { port: 5173, strictPort: true, host: "0.0.0.0", allowedHosts: true },
});
