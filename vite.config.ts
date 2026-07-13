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
  // `host: true` binds to 0.0.0.0 so other devices on your LAN (e.g. your phone
  // on the same WiFi) can load the dev server at http://<your-PC-IP>:5173 — handy
  // for testing touch/mobile behavior without deploying. Dev-only; unused by build.
  server: { port: 5173, open: true, host: true },
});
