import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const REPO = resolve(import.meta.dirname, "..");

/**
 * The skin preview (see the developer guide, *Looking at the sidebar*).
 *
 * Not a WXT build: the sidebar is browser-free by construction — P3 keeps
 * every `browser.*` call behind a port — so the panel mounts on the in-memory
 * fakes with nothing shimmed. That is what makes this twenty lines rather
 * than a fake extension host.
 */
export default defineConfig({
  root: import.meta.dirname,
  plugins: [svelte()],
  // The same directory the extension bundle is built from, so `/fonts/…` in
  // `tdr.css` resolves here exactly as it does in the packaged extension.
  publicDir: resolve(REPO, "public"),
  resolve: { alias: { "@": resolve(REPO, "src") } },
  build: { outDir: resolve(REPO, ".output/preview"), emptyOutDir: true },
});
