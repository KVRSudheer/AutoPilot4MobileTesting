import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type PluginOption } from "vite";
import { uipathCodedApps } from "@uipath/coded-apps-dev/vite";

// Enable the UiPath Coded Apps dev plugin (injects the uipath:* meta tags the
// SDK reads) only once uipath.json has a real clientId; with the placeholder
// manifest the app runs exactly as before.
function codedAppsPlugin(): PluginOption[] {
  try {
    const manifestPath = fileURLToPath(new URL("./uipath.json", import.meta.url));
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { clientId?: string };
    if (manifest.clientId && !manifest.clientId.startsWith("<")) {
      return [uipathCodedApps() as PluginOption];
    }
  } catch {
    /* missing/invalid uipath.json -> plain dev mode */
  }
  return [];
}

export default defineConfig({
  // Relative asset paths so the build resolves under the <base href> that
  // UiPath Coded Apps injects at deployment.
  base: "./",
  plugins: [react(), tailwindcss(), ...codedAppsPlugin()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
