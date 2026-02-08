#!/usr/bin/env bun
/**
 * Example: Deploy a new site using SiteOrchestrator
 *
 * Usage: bun examples/deploy-example.ts <domain>
 */

import { DEFAULTS, PATHS, SiteOrchestrator } from "../src/index"

const domain = process.argv[2]

if (!domain) {
  console.error("Usage: bun examples/deploy-example.ts <domain>")
  process.exit(1)
}

const slug = domain.replace(/\./g, "-")

async function main() {
  try {
    const result = await SiteOrchestrator.deploy({
      domain,
      slug,
      templatePath: PATHS.TEMPLATE_PATH,
      serverIp: DEFAULTS.SERVER_IP,
      wildcardDomain: DEFAULTS.WILDCARD_DOMAIN,
      rollbackOnFailure: true,
    })

    if (result.success) {
      console.log("\n✅ Deployment successful!")
      console.log(`   Domain: ${result.domain}`)
      console.log(`   Port: ${result.port}`)
      console.log(`   Service: ${result.serviceName}`)
      console.log(`   URL: https://${result.domain}`)
    } else {
      console.error("\n❌ Deployment failed!")
      console.error(`   Error: ${result.error}`)
      console.error(`   Failed at: ${result.failedPhase}`)
      process.exit(1)
    }
  } catch (error) {
    console.error("\n💥 Unexpected error:", error)
    process.exit(1)
  }
}

main()
