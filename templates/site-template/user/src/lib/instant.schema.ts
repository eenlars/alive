import { i } from "@instantdb/react"

// Define your InstantDB schema here
// See: https://www.instantdb.com/docs/modeling-data

const schema = i.schema({
  entities: {
    // Example entity - replace with your own
    // items: i.entity({
    //   name: i.string(),
    //   description: i.string().optional(),
    //   status: i.string(),
    //   createdAt: i.string(),
    //   updatedAt: i.string(),
    // }),
  },
})

export default schema
export type Schema = typeof schema
