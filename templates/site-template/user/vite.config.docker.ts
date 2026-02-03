import path from "node:path"
import react from "@vitejs/plugin-react-swc"
import { aliveTagger } from "@alive-game/alive-tagger"
import { defineConfig } from "vite"

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 3594,
    strictPort: true,
    allowedHosts: ["blank.alive.best"],
    hmr: {
      protocol: "wss",
      host: "blank.alive.best",
      port: 443,
      path: "/__vite_hmr",
    },
    fs: {
      strict: true,
      allow: ["/app"],
    },
    cors: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 3594,
    allowedHosts: ["blank.alive.best"],
  },
  plugins: [react(), mode === "development" && aliveTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}))
