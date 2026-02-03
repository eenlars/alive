import type { Config } from "drizzle-kit"

export default {
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Include all schemas used by Claude Bridge
  schemaFilter: ["iam", "app", "integrations", "lockbox", "public"],
  verbose: true,
  strict: true,
} satisfies Config
