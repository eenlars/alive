/**
 * Domain types
 */

export interface Site {
  name: string
  path: string
}

/** API response format from server - preserved for compatibility */
export interface ApiTreeNode {
  text: string
  icon: string
  state?: { opened: boolean }
  children?: ApiTreeNode[]
  data: { path: string; type: "file" | "directory" }
}

/** Internal tree node with discriminated union for type safety */
export type TreeNode = {
  text: string
  path: string
  type: "file" | "directory"
  children?: TreeNode[]
}

/** Transform API response to internal format */
export function transformApiTree(nodes: ApiTreeNode[]): TreeNode[] {
  return nodes.map(node => ({
    text: node.text,
    path: node.data.path,
    type: node.data.type,
    children: node.children ? transformApiTree(node.children) : undefined,
  }))
}

export type MessageType = "success" | "error" | null

export type ItemType = "file" | "directory"

/** Selected item in file tree - null when nothing selected */
export type SelectedItem = {
  path: string
  type: ItemType
} | null
