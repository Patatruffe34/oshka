import { isAbsolute } from "node:path";
import { defineConfig } from "vite";

/*
 * The Cloud Functions, bundled as one CommonJS file that Node runs as it is.
 * src/lib comes along: it is ESM with extensionless imports, which Node cannot
 * load, and running the app's own code is the only way the server keeps
 * agreeing with it about what ticking a repeating card does or what the Agenda
 * calls "this week". Dependencies stay external, installed from
 * functions/package.json at deploy. Runs before every functions deploy.
 */
export default defineConfig({
  publicDir: false,
  build: {
    ssr: "functions/index.ts",
    outDir: "functions/build",
    emptyOutDir: true,
    minify: false,
    target: "node22",
    rolldownOptions: {
      // Every package import, Node's built-ins included; only our own files go in
      external: (id: string) => !id.startsWith(".") && !isAbsolute(id) && !id.startsWith("\0"),
      output: { format: "cjs", entryFileNames: "index.cjs" },
    },
  },
});
