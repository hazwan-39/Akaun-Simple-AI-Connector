// Bundles the API (and @akaun/shared source) into a single ESM file.
// node_modules dependencies stay external and are installed on the server.
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: true,
  external: Object.keys(pkg.dependencies ?? {}),
  logLevel: "info",
});
