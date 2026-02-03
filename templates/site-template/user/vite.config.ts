import path from "node:path"
import react from "@vitejs/plugin-react-swc"
import { aliveTagger } from "@alive-game/alive-tagger"
import { defineConfig } from "vite"

// In dev: Vite is the main server on PORT, API runs on internal port (PORT+1000)
const PORT = Number(process.env.PORT) || 8080
const API_PORT = PORT + 1000

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: PORT,
    allowedHosts: ["localhost", ".alive.best", ".goalive.nl", ".preview.terminal.goalive.nl"],
    hmr: {
      // For reverse proxy (Caddy) with HTTPS
      protocol: "wss",
      clientPort: 443,
    },
    proxy: {
      "/api": {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "::",
    port: PORT,
    allowedHosts: ["localhost", ".alive.best", ".goalive.nl", ".preview.terminal.goalive.nl"],
  },
  plugins: [react(), mode === "development" && aliveTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}))
