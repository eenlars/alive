import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  // Don't bundle vite - it's a peer dependency
  external: ["vite"],
})
