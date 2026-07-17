// @ts-check

import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const ROOT = fileURLToPath(new URL(".", import.meta.url))
const SRC = join(ROOT, "src")
const RUNTIME_DEPENDENCY_FIELDS = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
]

function collectProductionFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectProductionFiles(full))
    } else if (
      /\.[cm]?[jt]sx?$/.test(entry.name) &&
      !entry.name.includes(".test.") &&
      !entry.name.includes(".spec.")
    ) {
      files.push(full)
    }
  }
  return files
}

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

function lineAt(source, index) {
  return source.slice(0, index).split("\n").length
}

export function scanSource(relPath, source) {
  const scanned = blankComments(source)
  const violations = []

  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(scanned)) !== null) {
      const specifier = match[1]
      if (specifier && !specifier.startsWith(".")) {
        violations.push({
          file: relPath,
          line: lineAt(scanned, match.index),
          specifier,
          rule: "production code may use relative imports only",
        })
      }
    }
  }

  return violations
}

export function scanManifest(manifest) {
  const violations = []
  for (const field of RUNTIME_DEPENDENCY_FIELDS) {
    const dependencies = manifest[field]
    if (!dependencies || typeof dependencies !== "object") continue

    for (const dependency of Object.keys(dependencies)) {
      violations.push({ field, dependency })
    }
  }
  return violations
}

function run() {
  const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))
  const manifestViolations = scanManifest(manifest)
  const importViolations = collectProductionFiles(SRC).flatMap((file) => {
    const relPath = relative(SRC, file).split("\\").join("/")
    return scanSource(relPath, readFileSync(file, "utf8"))
  })

  if (manifestViolations.length === 0 && importViolations.length === 0) {
    console.log(
      "✓ result dependency check passed (no runtime dependencies or bare production imports)."
    )
    return
  }

  console.error("✖ result dependency check failed:\n")
  for (const violation of manifestViolations) {
    console.error(`  package.json ${violation.field}.${violation.dependency}`)
  }
  for (const violation of importViolations) {
    console.error(
      `  src/${violation.file}:${violation.line}  ${violation.specifier}\n    └─ ${violation.rule}`
    )
  }
  process.exitCode = 1
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run()
}
