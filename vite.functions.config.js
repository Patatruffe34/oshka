import { defineConfig } from "vite";

/*
 * src/lib bundled as CommonJS for the Cloud Functions — see
 * functions/mcp/oshka.entry.js. Runs before every functions deploy.
 */
export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: "functions/mcp/oshka.entry.js",
      formats: ["cjs"],
      fileName: () => "oshka.cjs",
    },
    outDir: "functions/mcp/build",
    emptyOutDir: true,
    minify: false,
    target: "node22",
  },
});
