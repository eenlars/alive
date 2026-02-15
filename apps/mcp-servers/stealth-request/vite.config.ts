import { resolve } from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "StealthRequest",
      fileName: "index",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["puppeteer", "puppeteer-extra", "puppeteer-extra-plugin-stealth", "zod", "node:crypto"],
      output: {
        globals: {
          puppeteer: "puppeteer",
          "puppeteer-extra": "puppeteerExtra",
          "puppeteer-extra-plugin-stealth": "stealthPlugin",
          zod: "z",
        },
      },
    },
    target: "esnext",
    minify: false,
  },
})
