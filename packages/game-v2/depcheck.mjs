// @ts-check

import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * The hard dependency gate for `@workspace/game-v2` (UNN-499). ESLint cannot be
 * the gate here: the shared `@workspace/eslint-config` runs
 * `eslint-plugin-only-warn`, which downgrades every rule — including the
 * `no-restricted-imports` import bans — to a *warning*, so `eslint` exits 0 even
 * on a violation. This script fails closed (exit 1) so CI and the local loop
 * actually enforce the two load-bearing rules:
 *
 *  1. **Independence (D32).** v2 is the successor that replaces v1, so it imports
 *     **nothing** from `@workspace/game`. The dying types (`HydratedCharacter`,
 *     `CombatantRef`, `Statblock`) must not leak in — not even type-only.
 *  2. **Logic never value-imports the concrete catalog (D33).** Catalog access is
 *     injected through the `kernel/ports` seam; only `catalog/**` (the
 *     implementation) and `composition.ts` (which binds it) may name it directly.
 *
 * The ESLint rules in `eslint.config.js` mirror these for editor-time signal;
 * this script is the enforcement.
 */

const ROOT = fileURLToPath(new URL(".", import.meta.url))
const SRC = join(ROOT, "src")

/**
 * Recursively collect every `.ts` file under `dir`.
 * @param {string} dir
 */
function collectTsFiles(dir) {
  /** @type {string[]} */
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(full))
    } else if (entry.name.endsWith(".ts")) {
      files.push(full)
    }
  }
  return files
}

const IMPORT_PATTERN =
  /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g

/**
 * A relative POSIX path is allowed to name the catalog only here.
 * @param {string} relPath
 */
function mayImportCatalog(relPath) {
  return relPath.startsWith("catalog/") || relPath === "composition.ts"
}

/** @type {{ file: string; line: number; specifier: string; rule: string }[]} */
const violations = []

for (const file of collectTsFiles(SRC)) {
  const relPath = relative(SRC, file).split("\\").join("/")
  const source = readFileSync(file, "utf8")
  const lines = source.split("\n")

  lines.forEach((line, index) => {
    IMPORT_PATTERN.lastIndex = 0
    let match
    while ((match = IMPORT_PATTERN.exec(line)) !== null) {
      const specifier = match[1] ?? match[2]
      if (!specifier) continue

      if (
        specifier === "@workspace/game" ||
        specifier.startsWith("@workspace/game/")
      ) {
        violations.push({
          file: relPath,
          line: index + 1,
          specifier,
          rule: "no @workspace/game imports — v2 is independent (D32)",
        })
      }

      const isCatalog =
        specifier === "@workspace/game-v2/catalog" ||
        specifier.startsWith("@workspace/game-v2/catalog/")
      if (isCatalog && !mayImportCatalog(relPath)) {
        violations.push({
          file: relPath,
          line: index + 1,
          specifier,
          rule: "logic must not value-import catalog — inject via kernel/ports (D33)",
        })
      }
    }
  })
}

if (violations.length > 0) {
  console.error("✖ game-v2 dependency check failed:\n")
  for (const v of violations) {
    console.error(`  src/${v.file}:${v.line}  ${v.specifier}\n    └─ ${v.rule}`)
  }
  console.error(`\n${violations.length} violation(s).`)
  process.exit(1)
}

console.log("✓ game-v2 dependency check passed (no forbidden imports).")
