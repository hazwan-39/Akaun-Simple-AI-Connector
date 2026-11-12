import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { defineConfig } from "vite";

/** Office add-ins require HTTPS even in development. Certs come from `npm run certs`. */
function devHttps() {
  const dir = join(homedir(), ".office-addin-dev-certs");
  const key = join(dir, "localhost.key");
  const cert = join(dir, "localhost.crt");
  if (existsSync(key) && existsSync(cert)) return { key: readFileSync(key), cert: readFileSync(cert) };
  return undefined;
}

export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    alias: { "@akaun/shared": resolve(__dirname, "../../packages/shared/src/index.ts") },
  },
  server: {
    port: 3000,
    strictPort: true,
    https: command === "serve" ? devHttps() : undefined,
    proxy: { "/api": { target: "http://127.0.0.1:8787", changeOrigin: false } },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: { taskpane: resolve(__dirname, "taskpane.html"), commands: resolve(__dirname, "commands.html") },
    },
  },
}));
