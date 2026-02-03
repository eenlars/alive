import { init } from "@instantdb/react"
import schema from "./instant.schema"

const APP_ID = import.meta.env.VITE_INSTANT_APP_ID

if (!APP_ID) {
  console.error("Missing VITE_INSTANT_APP_ID environment variable")
}

const db = init({ appId: APP_ID || "", schema })

export default db
