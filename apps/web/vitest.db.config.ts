import { defineConfig } from "vitest/config"
import { baseTestConfig, dbIntegrationGlobs, sharedConfig } from "./vitest.config"

export default defineConfig({
  ...sharedConfig,
  test: {
    ...baseTestConfig,
    environment: "node",
    include: dbIntegrationGlobs,
  },
})
