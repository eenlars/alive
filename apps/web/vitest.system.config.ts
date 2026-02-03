import { defineConfig } from "vitest/config"
import { baseTestConfig, sharedConfig, systemGlobs } from "./vitest.config"

export default defineConfig({
  ...sharedConfig,
  test: {
    ...baseTestConfig,
    environment: "node",
    include: systemGlobs,
  },
})
