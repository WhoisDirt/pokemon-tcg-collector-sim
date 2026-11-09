/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "./",
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2020", chunkSizeWarningLimit: 4000 },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test-setup.ts"] },
});
