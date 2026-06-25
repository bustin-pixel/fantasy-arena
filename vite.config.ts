import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  // Relative base so built asset URLs work whether the site is served from the
  // domain root or a subpath (avoids the common blank-page-after-deploy issue).
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: { port: 5173, open: true },
});
