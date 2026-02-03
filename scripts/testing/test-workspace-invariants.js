#!/usr/bin/env node

/**
 * Test script for Patrick's workspace invariants
 * Tests both invariants:
 * A) resolveWorkspace(host) → /srv/webalive/sites/<host>/user/src
 * B) write(path, bytes) runs-as uid:gid of resolveWorkspace(host)
 */

import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import {
  ensurePathWithinWorkspace,
  getWorkspace,
  resolveWorkspace,
  writeAsWorkspaceOwner,
} from "../apps/web/lib/workspace-secure.js"

const RED = "\x1b[0;31m"
const GREEN = "\x1b[0;32m"
const YELLOW = "\x1b[1;33m"
const BLUE = "\x1b[0;34m"
const NC = "\x1b[0m"

function log(msg) {
  console.log(`${BLUE}[TEST]${NC} ${msg}`)
}

function pass(msg) {
  console.log(`${GREEN}[PASS]${NC} ${msg}`)
}

function fail(msg) {
  console.log(`${RED}[FAIL]${NC} ${msg}`)
}

function warn(msg) {
  console.log(`${YELLOW}[WARN]${NC} ${msg}`)
}

// Test configuration
const TEST_DOMAINS = ["barendbootsma.com", "homable.nl"]
const EVIL_INPUTS = ["../../../etc/passwd", "foo/../../etc", ".."]

/**
 * Test Invariant A: Workspace Resolution
 */
function testWorkspaceResolution() {
  log("Testing Invariant A: Workspace Resolution")

  let allPassed = true

  for (const domain of TEST_DOMAINS) {
    try {
      log(`Testing resolution for ${domain}`)

      // Test basic resolution
      const workspace = getWorkspace(domain)
      const expectedPath = `/srv/webalive/sites/${domain}/user/src`

      if (workspace.root === expectedPath) {
        pass(`✓ ${domain} resolves to correct path: ${workspace.root}`)
      } else {
        fail(`✗ ${domain} resolved to ${workspace.root}, expected ${expectedPath}`)
        allPassed = false
      }

      // Test uid/gid detection
      if (workspace.uid > 0 && workspace.gid > 0) {
        pass(`✓ ${domain} has valid uid:gid (${workspace.uid}:${workspace.gid})`)
      } else {
        fail(`✗ ${domain} has invalid uid:gid (${workspace.uid}:${workspace.gid})`)
        allPassed = false
      }

      // Test tenant ID mapping
      if (workspace.tenantId === domain) {
        pass(`✓ ${domain} tenant ID is correct: ${workspace.tenantId}`)
      } else {
        fail(`✗ ${domain} tenant ID is ${workspace.tenantId}, expected ${domain}`)
        allPassed = false
      }
    } catch (error) {
      fail(`✗ ${domain} resolution failed: ${error.message}`)
      allPassed = false
    }
  }

  return allPassed
}

/**
 * Test Containment Protection
 */
function testContainmentProtection() {
  log("Testing Containment Protection")

  let allPassed = true

  // Test with a valid domain
  const testDomain = TEST_DOMAINS[0]

  try {
    const workspace = getWorkspace(testDomain)

    for (const evilInput of EVIL_INPUTS) {
      try {
        ensurePathWithinWorkspace(evilInput, workspace.root)
        fail(`✗ Evil input ${evilInput} was allowed (should be blocked)`)
        allPassed = false
      } catch (error) {
        pass(`✓ Evil input ${evilInput} correctly blocked: ${error.message}`)
      }
    }

    // Test valid path
    const validPath = path.join(workspace.root, "data", "test.txt")
    try {
      ensurePathWithinWorkspace(validPath, workspace.root)
      pass(`✓ Valid path ${validPath} correctly allowed`)
    } catch (error) {
      fail(`✗ Valid path ${validPath} incorrectly blocked: ${error.message}`)
      allPassed = false
    }
  } catch (error) {
    fail(`✗ Containment test setup failed: ${error.message}`)
    allPassed = false
  }

  return allPassed
}

/**
 * Test Invariant B: File Ownership (if running as root)
 */
function testFileOwnership() {
  log("Testing Invariant B: File Ownership")

  if (process.getuid() !== 0) {
    warn("Skipping ownership tests (not running as root)")
    return true
  }

  let allPassed = true
  const testDomain = TEST_DOMAINS[0]

  try {
    const workspace = getWorkspace(testDomain)

    // Create test directory if it doesn't exist
    const testDir = path.join(workspace.root, "test-ownership")
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true })
    }

    // Test file creation with correct ownership
    const testFile = path.join(testDir, `test-${crypto.randomUUID()}.txt`)
    const testContent = "Test content for ownership verification"

    log(`Creating test file: ${testFile}`)
    writeAsWorkspaceOwner(testFile, testContent, workspace)

    // Verify file was created
    if (fs.existsSync(testFile)) {
      pass("✓ Test file created successfully")
    } else {
      fail("✗ Test file was not created")
      allPassed = false
      return allPassed
    }

    // Verify ownership
    const stats = fs.statSync(testFile)
    if (stats.uid === workspace.uid && stats.gid === workspace.gid) {
      pass(`✓ File has correct ownership: ${stats.uid}:${stats.gid}`)
    } else {
      fail(`✗ File has wrong ownership: ${stats.uid}:${stats.gid}, expected ${workspace.uid}:${workspace.gid}`)
      allPassed = false
    }

    // Verify content
    const readContent = fs.readFileSync(testFile, "utf8")
    if (readContent === testContent) {
      pass("✓ File content is correct")
    } else {
      fail("✗ File content is incorrect")
      allPassed = false
    }

    // Clean up
    fs.unlinkSync(testFile)
    pass("✓ Test file cleaned up")
  } catch (error) {
    fail(`✗ File ownership test failed: ${error.message}`)
    allPassed = false
  }

  return allPassed
}

/**
 * Performance test
 */
function testPerformance() {
  log("Testing Performance")

  const testDomain = TEST_DOMAINS[0]
  const iterations = 10

  try {
    // Test workspace resolution performance
    const start = Date.now()
    for (let i = 0; i < iterations; i++) {
      getWorkspace(testDomain)
    }
    const resolutionTime = (Date.now() - start) / iterations

    if (resolutionTime < 10) {
      pass(`✓ Workspace resolution: ${resolutionTime.toFixed(2)}ms average (< 10ms target)`)
    } else {
      warn(`⚠ Workspace resolution: ${resolutionTime.toFixed(2)}ms average (target < 10ms)`)
    }

    // Test file write performance (if running as root)
    if (process.getuid() === 0) {
      const workspace = getWorkspace(testDomain)
      const testDir = path.join(workspace.root, "perf-test")
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true })
      }

      const writeStart = Date.now()
      const testFiles = []

      for (let i = 0; i < iterations; i++) {
        const testFile = path.join(testDir, `perf-test-${i}.txt`)
        writeAsWorkspaceOwner(testFile, "Performance test content", workspace)
        testFiles.push(testFile)
      }

      const writeTime = (Date.now() - writeStart) / iterations

      // Clean up
      testFiles?.forEach(file => {
        try {
          fs.unlinkSync(file)
        } catch (error) {
          console.error(`Failed to delete test file: ${file}`, error)
          allPassed = false
        }
      })

      if (writeTime < 25) {
        pass(`✓ Atomic write: ${writeTime.toFixed(2)}ms average (< 25ms target)`)
      } else {
        warn(`⚠ Atomic write: ${writeTime.toFixed(2)}ms average (target < 25ms)`)
      }
    }

    return true
  } catch (error) {
    fail(`✗ Performance test failed: ${error.message}`)
    return false
  }
}

/**
 * Main test runner
 */
function main() {
  log("Starting workspace invariant tests")
  log(`Running as user: ${process.getuid() === 0 ? "root" : "non-root"}`)

  const tests = [
    { name: "Workspace Resolution", fn: testWorkspaceResolution },
    { name: "Containment Protection", fn: testContainmentProtection },
    { name: "File Ownership", fn: testFileOwnership },
    { name: "Performance", fn: testPerformance },
  ]

  let allPassed = true
  const results = []

  for (const test of tests) {
    log(`\\n--- ${test.name} ---`)
    const passed = test.fn()
    results.push({ name: test.name, passed })
    if (!passed) allPassed = false
  }

  // Summary
  log("\\n--- SUMMARY ---")
  for (const result of results) {
    if (result.passed) {
      pass(`${result.name}: PASSED`)
    } else {
      fail(`${result.name}: FAILED`)
    }
  }

  if (allPassed) {
    pass("\\n🎉 All tests passed! Patrick's invariants are working correctly.")
    process.exit(0)
  } else {
    fail("\\n❌ Some tests failed. Check the output above for details.")
    process.exit(1)
  }
}

main()
