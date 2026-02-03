import { assertSupabaseManagementEnv } from "@/lib/test-helpers/integration-env"

/**
 * Supabase Test Utilities
 * Direct SQL execution for testing (bypasses REST API schema issues)
 */

function ensureManagementEnv() {
  assertSupabaseManagementEnv()
}

async function executeSql(query: string) {
  ensureManagementEnv()

  // Read env values inside function to ensure validation and usage are in sync
  const projectId = process.env.SUPABASE_PROJECT_ID!
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN!

  // Use globalThis.fetch to bypass Happy DOM's CORS restrictions
  const nodeFetch = globalThis.fetch
  const response = await nodeFetch(`https://api.supabase.com/v1/projects/${projectId}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`SQL query failed: ${JSON.stringify(error)}`)
  }

  return response.json()
}

export const createTestIamClient = () => ({
  from: (table: string) => ({
    insert: async (data: any) => {
      const columns = Object.keys(data).join(", ")
      const values = Object.values(data)
        .map(v => `'${v}'`)
        .join(", ")
      const query = `INSERT INTO iam.${table} (${columns}) VALUES (${values})`

      try {
        await executeSql(query)
        return { error: null }
      } catch (error: any) {
        return { error: { message: error.message } }
      }
    },
    select: (columns = "*") => ({
      eq: (column: string, value: any) => ({
        single: async () => {
          const query = `SELECT ${columns} FROM iam.${table} WHERE ${column} = '${value}' LIMIT 1`
          try {
            const result = await executeSql(query)
            return { data: result[0] || null, error: null }
          } catch (error: any) {
            return { data: null, error: { message: error.message } }
          }
        },
      }),
    }),
    delete: () => ({
      eq: async (column: string, value: any) => {
        const query = `DELETE FROM iam.${table} WHERE ${column} = '${value}'`
        try {
          await executeSql(query)
          return { error: null }
        } catch (error: any) {
          return { error: { message: error.message } }
        }
      },
    }),
  }),
})

export const createTestAppClient = () => ({
  from: (table: string) => ({
    insert: async (data: any) => {
      const columns = Object.keys(data).join(", ")
      const values = Object.values(data)
        .map(v => (typeof v === "number" ? v : `'${v}'`))
        .join(", ")
      const query = `INSERT INTO app.${table} (${columns}) VALUES (${values})`

      try {
        await executeSql(query)
        return { error: null }
      } catch (error: any) {
        return { error: { message: error.message } }
      }
    },
    delete: () => ({
      eq: async (column: string, value: any) => {
        const query = `DELETE FROM app.${table} WHERE ${column} = '${value}'`
        try {
          await executeSql(query)
          return { error: null }
        } catch (error: any) {
          return { error: { message: error.message } }
        }
      },
    }),
  }),
})
