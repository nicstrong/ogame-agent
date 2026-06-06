import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  resolve: {
    alias: {
      // Resolve the workspace core package to its TS source for tests (build-free).
      // Runtime/build still use dist via package exports + `tsc -b`.
      "@ogame-agent/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
    },
  },
});
