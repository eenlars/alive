import { spawn } from "node:child_process"
import { resolve } from "node:path"
import { PATHS } from "@webalive/shared"

/**
 * Error thrown when a script execution fails
 */
export class ScriptError extends Error {
  constructor(
    public script: string,
    public exitCode: number,
    public stderr: string,
    public stdout: string,
  ) {
    super(`Script ${script} failed with exit code ${exitCode}`)
    this.name = "ScriptError"
  }
}

/**
 * Execute a bash script with given environment variables
 *
 * @param scriptName - Name of the script file (e.g., '00-validate-dns.sh')
 * @param env - Environment variables to pass to the script
 * @returns Promise resolving to stdout content
 * @throws ScriptError if script exits with non-zero code
 */
export async function runScript(scriptName: string, env: Record<string, string>): Promise<string> {
  // Use absolute path to scripts directory to avoid path resolution issues with symlinks
  const scriptsDir = PATHS.SCRIPTS_DIR
  const scriptPath = resolve(scriptsDir, scriptName)
  console.log(`[runScript] Scripts dir: ${scriptsDir}`)
  console.log(`[runScript] Resolved script path: ${scriptPath}`)

  return new Promise((resolve, reject) => {
    const proc = spawn(scriptPath, [], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
      shell: "/bin/bash",
    })

    let stdout = ""
    let stderr = ""

    proc.stdout.on("data", data => {
      const text = data.toString()
      stdout += text
      // Log to console for visibility
      process.stdout.write(`[${scriptName}] ${text}`)
    })

    proc.stderr.on("data", data => {
      const text = data.toString()
      stderr += text
      // Log to console for visibility
      process.stderr.write(`[${scriptName}] ${text}`)
    })

    proc.on("close", code => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(new ScriptError(scriptName, code || 1, stderr.trim(), stdout.trim()))
      }
    })

    proc.on("error", err => {
      reject(new Error(`Failed to spawn script ${scriptName}: ${err.message}`))
    })
  })
}

/**
 * Execute a script and return both exit code and output
 * Does not throw on non-zero exit
 *
 * @param scriptName - Name of the script file
 * @param env - Environment variables to pass to the script
 * @returns Promise resolving to {exitCode, stdout, stderr}
 */
export async function runScriptSafe(
  scriptName: string,
  env: Record<string, string>,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const stdout = await runScript(scriptName, env)
    return { exitCode: 0, stdout, stderr: "" }
  } catch (error) {
    if (error instanceof ScriptError) {
      return {
        exitCode: error.exitCode,
        stdout: error.stdout,
        stderr: error.stderr,
      }
    }
    throw error
  }
}
