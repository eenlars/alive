import { readdir, readFile, stat } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  isTemplateEnabled,
  type PartialTemplateFrontmatter,
  parseFrontmatter,
} from "../src/lib/template-frontmatter.js"
import { type GetTemplateParams, getTemplate } from "../src/tools/templates/get-template.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const templatesPath = join(__dirname, "../supertemplate/templates")

/**
 * Check if a template file is enabled.
 * Reads the file and parses frontmatter.
 */
async function isTemplateFileEnabled(filePath: string): Promise<boolean> {
  const content = await readFile(filePath, "utf-8")
  return isTemplateEnabled(content)
}

/**
 * Recursively find all .md template files in the templates directory.
 * Returns array of { filePath, category, id } for each template.
 */
async function findAllTemplateFiles(): Promise<Array<{ filePath: string; category: string; id: string }>> {
  const results: Array<{ filePath: string; category: string; id: string }> = []
  const categories = await readdir(templatesPath, { withFileTypes: true })

  for (const entry of categories) {
    if (!entry.isDirectory()) continue
    const category = entry.name
    const categoryPath = join(templatesPath, category)
    const files = await readdir(categoryPath)

    for (const file of files) {
      if (!file.endsWith(".md")) continue
      const id = file.replace(".md", "")
      results.push({
        filePath: join(categoryPath, file),
        category,
        id,
      })
    }
  }
  return results
}

describe("getTemplate", () => {
  describe("All template files accessible", () => {
    it("should have at least one template file", async () => {
      const templates = await findAllTemplateFiles()
      expect(templates.length).toBeGreaterThan(0)
    })

    it("all template files should be world-readable (catches permission issues)", async () => {
      const templates = await findAllTemplateFiles()
      const errors: string[] = []

      for (const template of templates) {
        const fileStat = await stat(template.filePath)
        const mode = fileStat.mode

        // Check if file has "others read" permission (0o004)
        // This catches files with 600 permissions even when running as root
        const othersCanRead = (mode & 0o004) !== 0

        if (!othersCanRead) {
          const octalMode = (mode & 0o777).toString(8)
          errors.push(`${template.category}/${template.id}.md - mode ${octalMode}, missing world-read permission`)
        }
      }

      if (errors.length > 0) {
        throw new Error(`Template files with permission issues:\n${errors.join("\n")}\n\nFix with: chmod 644 <file>`)
      }
    })

    it("all available templates should be retrievable via getTemplate()", async () => {
      const templates = await findAllTemplateFiles()
      const errors: string[] = []
      let skipped = 0

      for (const template of templates) {
        const available = await isTemplateFileEnabled(template.filePath)
        if (!available) {
          skipped++
          continue
        }

        const result = await getTemplate({ id: template.id }, templatesPath)
        if (result.isError) {
          errors.push(`${template.id}: ${result.content[0].text}`)
        }
      }

      if (errors.length > 0) {
        throw new Error(`Templates that failed to load:\n${errors.join("\n")}`)
      }

      // Sanity check: we should have tested at least one template
      const tested = templates.length - skipped
      expect(tested).toBeGreaterThan(0)
    })

    it("unavailable templates should return error when retrieved", async () => {
      const templates = await findAllTemplateFiles()
      let unavailableCount = 0

      for (const template of templates) {
        const available = await isTemplateFileEnabled(template.filePath)
        if (!available) {
          unavailableCount++
          // Verify the actual getTemplate function returns an error
          const result = await getTemplate({ id: template.id }, templatesPath)
          expect(result.isError).toBe(true)
          expect(result.content[0].text).toContain("is disabled")
        }
      }

      // We expect at least one unavailable template (template-browser)
      expect(unavailableCount).toBeGreaterThanOrEqual(1)
    })

    it("all templates should have valid frontmatter", async () => {
      const templates = await findAllTemplateFiles()
      const errors: string[] = []
      const requiredFields = ["name", "description", "category", "complexity", "enabled"]

      for (const template of templates) {
        const content = await readFile(template.filePath, "utf-8")
        const frontmatter = parseFrontmatter(content)

        if (!frontmatter) {
          errors.push(`${template.category}/${template.id}.md - missing frontmatter`)
          continue
        }

        for (const field of requiredFields) {
          if (frontmatter[field as keyof PartialTemplateFrontmatter] === undefined) {
            errors.push(`${template.category}/${template.id}.md - missing required field: ${field}`)
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Templates with invalid frontmatter:\n${errors.join("\n")}`)
      }
    })
  })

  describe("Valid template retrieval", () => {
    it("should retrieve carousel template by ID", async () => {
      const params: GetTemplateParams = {
        id: "carousel-thumbnails",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(false)
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe("text")
      expect(result.content[0].text).toContain("Auto-Scrolling Carousel")
      expect(result.content[0].text).toContain("category: components")
      expect(result.content[0].text).toContain("Ready to implement this template")
    })

    it("should retrieve map template by ID", async () => {
      const params: GetTemplateParams = {
        id: "map-basic-markers",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(false)
      expect(result.content[0].text).toContain("Interactive Map with Markers")
      expect(result.content[0].text).toContain("Leaflet")
    })

    it("should retrieve image upload template by ID", async () => {
      const params: GetTemplateParams = {
        id: "upload-image-crop",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(false)
      expect(result.content[0].text).toContain("Image Upload with Crop")
      expect(result.content[0].text).toContain("react-dropzone")
    })

    it("should retrieve recipe system template by ID", async () => {
      const params: GetTemplateParams = {
        id: "recipe-system-interactive",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(false)
      expect(result.content[0].text).toContain("Interactive Recipe System")
      expect(result.content[0].text).toContain("Recipe Template Interface")
    })
  })

  describe("Template not found", () => {
    it("should return error when template does not exist", async () => {
      const params: GetTemplateParams = {
        id: "nonexistent-template",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Template "nonexistent-template" not found')
    })

    it("should return error when templates path does not exist", async () => {
      const params: GetTemplateParams = {
        id: "carousel-thumbnails",
      }

      const result = await getTemplate(params, "/nonexistent/path")

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("not found")
    })

    it("should handle template ID with multiple dashes", async () => {
      const params: GetTemplateParams = {
        id: "my-complex-template-name",
      }

      const result = await getTemplate(params, templatesPath)

      // Valid format (just doesn't exist)
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("not found")
    })
  })

  describe("Security: Path traversal attacks", () => {
    it("should reject path traversal with ../", async () => {
      const params: GetTemplateParams = {
        id: "../etc/passwd",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("path traversal detected")
    })

    it("should reject path traversal with multiple ../", async () => {
      const params: GetTemplateParams = {
        id: "../../secret",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("path traversal detected")
    })

    it("should reject absolute paths", async () => {
      const params: GetTemplateParams = {
        id: "/etc/passwd",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("path traversal detected")
    })

    it("should reject Windows-style paths", async () => {
      const params: GetTemplateParams = {
        id: "C:\\Windows\\System32",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("path traversal detected")
    })

    it("should reject backslashes", async () => {
      const params: GetTemplateParams = {
        id: "templates\\..\\secret",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("path traversal detected")
    })

    it("should reject encoded path traversal attempts", async () => {
      const params: GetTemplateParams = {
        id: "..%2F..%2Fetc%2Fpasswd",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("path traversal detected")
    })
  })

  describe("Security: Input validation", () => {
    it("should reject empty string as template ID", async () => {
      const params: GetTemplateParams = {
        id: "",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("Template ID cannot be empty")
    })

    it("should reject whitespace-only template ID", async () => {
      const params: GetTemplateParams = {
        id: "   ",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("Template ID cannot be empty")
    })

    it("should reject template ID with only newlines", async () => {
      const params: GetTemplateParams = {
        id: "\n\n\n",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("Template ID cannot be empty")
    })

    it("should reject template ID that's too long", async () => {
      const params: GetTemplateParams = {
        id: "a".repeat(101),
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("Template ID too long")
      expect(result.content[0].text).toContain("Maximum length is 100 characters")
    })

    it("should reject template ID with null bytes", async () => {
      const params: GetTemplateParams = {
        id: "template\0test",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("invalid characters")
    })

    it("should reject template ID with special characters", async () => {
      const params: GetTemplateParams = {
        id: "template@special#chars",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("invalid characters")
    })

    it("should reject template ID with spaces", async () => {
      const params: GetTemplateParams = {
        id: "my template",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("invalid characters")
    })

    it("should reject template ID with unicode characters", async () => {
      const params: GetTemplateParams = {
        id: "template-™️",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("invalid characters")
    })

    it("should reject template ID with shell metacharacters", async () => {
      const params: GetTemplateParams = {
        id: "template;rm -rf /",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("path traversal detected")
    })

    it("should reject template ID with dots", async () => {
      const params: GetTemplateParams = {
        id: "template.test",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("invalid characters")
    })
  })

  describe("Edge cases", () => {
    it("should handle case-insensitive template IDs", async () => {
      const params: GetTemplateParams = {
        id: "CAROUSEL-THUMBNAILS",
      }

      const result = await getTemplate(params, templatesPath)

      // Template IDs are normalized to lowercase, so this should succeed
      expect(result.isError).toBe(false)
      expect(result.content[0].text).toContain("Auto-Scrolling Carousel")
    })

    it("should handle template ID at exactly 100 characters", async () => {
      const id = "a".repeat(100)
      const params: GetTemplateParams = { id }

      const result = await getTemplate(params, templatesPath)

      // Should pass length validation (but not be found)
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("not found")
      expect(result.content[0].text).not.toContain("too long")
    })
  })

  describe("Error handling", () => {
    it("should handle invalid base path gracefully", async () => {
      const params: GetTemplateParams = {
        id: "carousel-thumbnails",
      }

      const result = await getTemplate(params, "")

      expect(result.isError).toBe(true)
    })

    it("should include template ID in error messages", async () => {
      const params: GetTemplateParams = {
        id: "nonexistent",
      }

      const result = await getTemplate(params, templatesPath)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("nonexistent")
    })
  })
})
