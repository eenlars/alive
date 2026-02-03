#!/usr/bin/env node

/**
 * Migration Script: Convert plaintext passwords to bcrypt hashes
 *
 * This script reads domain-passwords.json and migrates all passwords
 * from the legacy "password" field to the new "passwordHash" field
 * using bcrypt hashing.
 *
 * Safety features:
 * - Creates automatic backup before migration
 * - Keeps legacy "password" field for rollback safety
 * - Only migrates domains that have "password" but not "passwordHash"
 * - Detailed logging of all operations
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import bcrypt from "bcrypt"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DOMAIN_PASSWORDS_FILE = join(__dirname, "..", "domain-passwords.json")
const BACKUP_FILE = `${DOMAIN_PASSWORDS_FILE}.backup-${Date.now()}`
const SALT_ROUNDS = 12

async function migratePasswords() {
  console.log("🔐 Password Migration Script: Plaintext → Bcrypt")
  console.log("=".repeat(60))
  console.log("")

  // 1. Check if file exists
  if (!existsSync(DOMAIN_PASSWORDS_FILE)) {
    console.error(`❌ Error: ${DOMAIN_PASSWORDS_FILE} not found`)
    process.exit(1)
  }

  // 2. Create backup
  console.log(`📦 Creating backup: ${BACKUP_FILE}`)
  try {
    copyFileSync(DOMAIN_PASSWORDS_FILE, BACKUP_FILE)
    console.log("✅ Backup created successfully")
  } catch (error) {
    console.error("❌ Failed to create backup:", error.message)
    process.exit(1)
  }

  // 3. Load domain passwords
  console.log("")
  console.log(`📖 Reading ${DOMAIN_PASSWORDS_FILE}`)
  let domainPasswords
  try {
    const content = readFileSync(DOMAIN_PASSWORDS_FILE, "utf8")
    domainPasswords = JSON.parse(content)
  } catch (error) {
    console.error("❌ Failed to parse JSON:", error.message)
    process.exit(1)
  }

  const totalDomains = Object.keys(domainPasswords).length
  console.log(`✅ Found ${totalDomains} domains`)

  // 4. Migrate passwords
  console.log("")
  console.log("🔄 Starting migration...")
  console.log("")

  const results = {
    migrated: [],
    alreadyHashed: [],
    skipped: [],
    errors: [],
  }

  for (const [domain, config] of Object.entries(domainPasswords)) {
    try {
      // Skip if already has passwordHash
      if (config.passwordHash) {
        console.log(`⏭️  ${domain}: Already has passwordHash, skipping`)
        results.alreadyHashed.push(domain)
        continue
      }

      // Skip if no password field
      if (!config.password) {
        console.log(`⚠️  ${domain}: No password field found, skipping`)
        results.skipped.push(domain)
        continue
      }

      // Migrate password
      console.log(`🔨 ${domain}: Hashing password...`)
      const plaintextPassword = config.password
      const hash = await bcrypt.hash(plaintextPassword, SALT_ROUNDS)

      // Add passwordHash field (keep password field for rollback safety)
      domainPasswords[domain].passwordHash = hash

      console.log(`✅ ${domain}: Successfully hashed`)
      results.migrated.push(domain)
    } catch (error) {
      console.error(`❌ ${domain}: Migration failed -`, error.message)
      results.errors.push({ domain, error: error.message })
    }
  }

  // 5. Save updated file
  console.log("")
  console.log("💾 Saving updated domain-passwords.json...")
  try {
    writeFileSync(DOMAIN_PASSWORDS_FILE, JSON.stringify(domainPasswords, null, 2), "utf8")
    console.log("✅ File saved successfully")
  } catch (error) {
    console.error("❌ Failed to save file:", error.message)
    console.log(`🔄 Restore backup with: cp ${BACKUP_FILE} ${DOMAIN_PASSWORDS_FILE}`)
    process.exit(1)
  }

  // 6. Summary
  console.log("")
  console.log("=".repeat(60))
  console.log("📊 Migration Summary")
  console.log("=".repeat(60))
  console.log(`Total domains:        ${totalDomains}`)
  console.log(`✅ Migrated:          ${results.migrated.length}`)
  console.log(`⏭️  Already hashed:    ${results.alreadyHashed.length}`)
  console.log(`⚠️  Skipped:           ${results.skipped.length}`)
  console.log(`❌ Errors:            ${results.errors.length}`)
  console.log("")

  if (results.migrated.length > 0) {
    console.log("Migrated domains:")
    results.migrated.forEach(d => console.log(`  - ${d}`))
    console.log("")
  }

  if (results.errors.length > 0) {
    console.log("❌ Errors encountered:")
    results.errors.forEach(({ domain, error }) => {
      console.log(`  - ${domain}: ${error}`)
    })
    console.log("")
  }

  console.log("=".repeat(60))
  console.log("🎉 Migration complete!")
  console.log("")
  console.log("📝 Next steps:")
  console.log("  1. Test login with a few migrated domains")
  console.log('  2. If successful, you can remove legacy "password" fields later')
  console.log(`  3. Backup stored at: ${BACKUP_FILE}`)
  console.log("")
}

// Run migration
migratePasswords().catch(error => {
  console.error("💥 Unexpected error:", error)
  process.exit(1)
})
