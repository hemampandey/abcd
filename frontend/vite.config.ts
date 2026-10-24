import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, the Vite server proxies /api to the FastAPI backend.
export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 800 },
  server: {
    port: 5173,
    proxy: { "/api": process.env.API_URL ?? "http://localhost:8000" },
  },
});
