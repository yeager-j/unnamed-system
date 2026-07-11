// @ts-check

import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import process from "node:process"
import { fileURLToPath, pathToFileURL } from "node:url"

import { ENGINE_IMPORT_ALLOWLIST } from "./depcheck-allowlist.mjs"

const ROOT = fileURLToPath(new URL(".", import.meta.url))
// The presentation tiers, hard-gated against `@workspace/game*`. `domain/**` and
// `lib/**` are the two engine-facing tiers and are intentionally un-gated (by
// omission): the domain layer binds the catalog and re-exports engine reads;
// plumbing may reach the engine directly. Presentation reads through domain view
// builders instead.
const GATED_ROOTS = ["app", "components", "hooks"]
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]

/**
 * @param {string} dir
 * @returns {string[]}
 */
function collectSourceFiles(dir) {
  /** @type {string[]} */
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full))
    } else if (
      SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
    ) {
      files.push(full)
    }
  }
  return files
}

/**
 * Blank comment bodies while preserving newlines and source indices.
 * @param {string} source
 * @returns {string}
 */
function blankComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (match) => " ".repeat(match.length))
}

const IMPORT_PATTERNS = [
  /^[ \t]*(?:import|export)\b[^"';]*?\bfrom\s*["']([^"']+)["']/gm,
  /^[ \t]*import\s*["']([^"']+)["']/gm,
  /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g,
]

/**
 * @param {string} source
 * @param {number} index
 * @returns {number}
 */
function lineAt(source, index) {
  return source.slice(0, index).split("\n").length
}

/**
 * @param {string} specifier
 * @returns {boolean}
 */
function isEngineSpecifier(specifier) {
  return /^@workspace\/game(?:$|[-/])/.test(specifier)
}

/**
 * Returns every forbidden engine import in one source file.
 * @param {string} relPath POSIX path relative to apps/web
 * @param {string} source
 * @returns {{ file: string; line: number; specifier: string }[]}
 */
export function scanSource(relPath, source) {
  const scanned = blankComments(source)
  /** @type {{ file: string; line: number; specifier: string }[]} */
  const violations = []

  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(scanned)) !== null) {
      const specifier = match[1]
      if (specifier && isEngineSpecifier(specifier)) {
        violations.push({
          file: relPath,
          line: lineAt(scanned, match.index),
          specifier,
        })
      }
    }
  }

  return violations
}

/**
 * Route loaders are the one seam-layer exception inside app/**.
 * @param {string} relPath POSIX path relative to apps/web
 * @returns {boolean}
 */
export function shouldGateFile(relPath) {
  return !(relPath.startsWith("app/") && relPath.endsWith("-access.ts"))
}

/**
 * @param {readonly string[]} actualViolations
 * @param {readonly string[]} allowlist
 */
export function reconcileAllowlist(actualViolations, allowlist) {
  const actual = new Set(actualViolations)
  const allowed = new Set(allowlist)
  const sorted = [...allowlist].sort((a, b) => a.localeCompare(b))

  return {
    newViolations: [...actual].filter((file) => !allowed.has(file)).sort(),
    staleEntries: [...allowed].filter((file) => !actual.has(file)).sort(),
    duplicateEntries: allowlist.filter(
      (file, index) => allowlist.indexOf(file) !== index
    ),
    isSorted: allowlist.every((file, index) => file === sorted[index]),
  }
}

/** @returns {{ files: string[]; violations: Map<string, { file: string; line: number; specifier: string }[]> }} */
function scanGatedRoots() {
  /** @type {Map<string, { file: string; line: number; specifier: string }[]>} */
  const violations = new Map()

  for (const root of GATED_ROOTS) {
    for (const file of collectSourceFiles(join(ROOT, root))) {
      const relPath = relative(ROOT, file).split("\\").join("/")
      if (!shouldGateFile(relPath)) continue
      const found = scanSource(relPath, readFileSync(file, "utf8"))
      if (found.length > 0) violations.set(relPath, found)
    }
  }

  return { files: [...violations.keys()].sort(), violations }
}

function run() {
  const { files, violations } = scanGatedRoots()

  if (process.argv.includes("--print-allowlist")) {
    for (const file of files) console.log(file)
    return
  }

  const result = reconcileAllowlist(files, ENGINE_IMPORT_ALLOWLIST)
  const failed =
    result.newViolations.length > 0 ||
    result.staleEntries.length > 0 ||
    result.duplicateEntries.length > 0 ||
    !result.isSorted

  if (!failed) {
    console.log(
      `✓ web dependency check passed (${files.length} grandfathered engine-import file(s)).`
    )
    return
  }

  console.error("✖ web dependency check failed:\n")
  for (const file of result.newViolations) {
    console.error(`  New violation: ${file}`)
    for (const violation of violations.get(file) ?? []) {
      console.error(`    ${violation.line}: ${violation.specifier}`)
    }
  }
  for (const file of result.staleEntries) {
    console.error(`  Stale allowlist entry: ${file}`)
  }
  for (const file of result.duplicateEntries) {
    console.error(`  Duplicate allowlist entry: ${file}`)
  }
  if (!result.isSorted) console.error("  Allowlist entries must be sorted.")
  console.error(
    "\nRemove stale entries when files are cleaned up; do not allowlist new imports."
  )
  process.exitCode = 1
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run()
}
