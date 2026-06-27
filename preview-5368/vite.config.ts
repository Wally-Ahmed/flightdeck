import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Standalone preview for GitHub issue #5368 (Markdown view mode).
// Alias `@/*` -> local stubs so the vendored component compiles with ZERO
// real internal deps and ZERO api-client.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/_stubs"),
    },
  },
});
