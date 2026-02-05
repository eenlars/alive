import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    exclude: ["**/node_modules/**", "dist/**", "**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "dist/**", "test/**", "src/**/__tests__/**"],
    },
  },
})
