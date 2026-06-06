import { fileURLToPath, URL } from "node:url";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite-plus";

const plugins: PluginOption[] = [
  react(),
  babel({ presets: [reactCompilerPreset()] }),
  tailwindcss(),
];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Resolve the workspace core package to its TS source so dev needs no build step.
      "@ogame-agent/core": fileURLToPath(
        new URL("../../packages/core/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": "http://127.0.0.1:3001",
    },
  },
});
