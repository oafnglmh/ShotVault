import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // ffmpeg.wasm spins up its own module worker; pre-bundling breaks the worker URL.
  optimizeDeps: { exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"] },
  worker: { format: "es" },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1500,
  },
  server: { host: true },
});
