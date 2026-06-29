// @ts-check

import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

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
 * @returns {string[]}
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

/**
 * Replaces the body of `//` and `/* *\/` comments with spaces (newlines kept),
 * so a forbidden specifier mentioned in prose or a `{@link import("…")}` JSDoc
 * tag can't trip the gate — while every character index still maps to its
 * original line. Imperfect around `//` inside string/regex literals, but those
 * never carry an import statement, so import detection is unaffected.
 * @param {string} source
 * @returns {string}
 */
function blankComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (match) => " ".repeat(match.length))
}

/**
 * The three forms an import specifier appears in. All scan the **whole file**
 * (not line-by-line, the old gap): the static form's `[^"';]*?` gobbles the
 * import clause across newlines, so a Prettier-wrapped grouped import — the
 * `} from "@workspace/game"` continuation line — is caught like any other. The
 * static/side-effect forms anchor at a line start (`^` with the `m` flag) so a
 * `* import … from "…"` JSDoc example can't match; the dynamic form is inline.
 */
const IMPORT_PATTERNS = [
  /^[ \t]*(?:import|export)\b[^"';]*?\bfrom\s*["']([^"']+)["']/gm,
  /^[ \t]*import\s*["']([^"']+)["']/gm,
  /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g,
]

/**
 * The 1-based line number of `index` within `source`.
 * @param {string} source
 * @param {number} index
 * @returns {number}
 */
function lineAt(source, index) {
  return source.slice(0, index).split("\n").length
}

/**
 * Every module specifier imported by `source`, with its line number.
 * @param {string} source
 * @returns {{ specifier: string; line: number }[]}
 */
function importSpecifiers(source) {
  const scanned = blankComments(source)
  /** @type {{ specifier: string; line: number }[]} */
  const found = []
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(scanned)) !== null) {
      found.push({ specifier: match[1], line: lineAt(scanned, match.index) })
    }
  }
  return found
}

/**
 * A relative POSIX path is allowed to name the catalog only here.
 * @param {string} relPath
 * @returns {boolean}
 */
function mayImportCatalog(relPath) {
  return relPath.startsWith("catalog/") || relPath === "composition.ts"
}

/**
 * The combat-facing domains the one-way spatial seam (SD2) forbids `spatial/**`
 * from importing. Spatial stands alone: it may import `kernel/` + `mechanics/`
 * (down the gradient) and nothing sideways. The seam is **asymmetric** —
 * `encounter → spatial` stays allowed (the composition tier + loader read spatial),
 * which is why the check keys off the *importing* file, not the specifier alone.
 */
const SPATIAL_SEALED_DOMAINS = ["encounter", "combat", "visibility"]

/**
 * Whether `specifier`, imported from `relPath`, crosses the forbidden direction of
 * the spatial seam (SD2): a `spatial/**` file reaching into `encounter`/`combat`/
 * `visibility`. Mirrors the absolute-specifier convention the eslint kernel-sink
 * rule uses (cross-domain imports are `@workspace/game-v2/<domain>`).
 * @param {string} relPath POSIX path relative to `src/`
 * @param {string} specifier
 * @returns {boolean}
 */
function isForbiddenSpatialImport(relPath, specifier) {
  if (!relPath.startsWith("spatial/")) return false
  return SPATIAL_SEALED_DOMAINS.some(
    (d) =>
      specifier === `@workspace/game-v2/${d}` ||
      specifier.startsWith(`@workspace/game-v2/${d}/`)
  )
}

/**
 * The pure rule check for one file's source — exported so the gate's own tests
 * can prove it fails closed on every import form (single-line, multi-line,
 * re-export, dynamic) without walking the filesystem.
 * @param {string} relPath POSIX path relative to `src/`
 * @param {string} source
 * @returns {{ file: string; line: number; specifier: string; rule: string }[]}
 */
export function scanSource(relPath, source) {
  /** @type {{ file: string; line: number; specifier: string; rule: string }[]} */
  const violations = []
  for (const { specifier, line } of importSpecifiers(source)) {
    if (
      specifier === "@workspace/game" ||
      specifier.startsWith("@workspace/game/")
    ) {
      violations.push({
        file: relPath,
        line,
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
        line,
        specifier,
        rule: "logic must not value-import catalog — inject via kernel/ports (D33)",
      })
    }

    if (isForbiddenSpatialImport(relPath, specifier)) {
      violations.push({
        file: relPath,
        line,
        specifier,
        rule: "spatial must not import encounter/combat/visibility — the seam is one-way (SD2)",
      })
    }
  }
  return violations
}

/** Walks `src/`, applies {@link scanSource}, and exits 1 on any violation. */
function run() {
  /** @type {{ file: string; line: number; specifier: string; rule: string }[]} */
  const violations = []
  for (const file of collectTsFiles(SRC)) {
    const relPath = relative(SRC, file).split("\\").join("/")
    violations.push(...scanSource(relPath, readFileSync(file, "utf8")))
  }

  if (violations.length > 0) {
    console.error("✖ game-v2 dependency check failed:\n")
    for (const v of violations) {
      console.error(
        `  src/${v.file}:${v.line}  ${v.specifier}\n    └─ ${v.rule}`
      )
    }
    console.error(`\n${violations.length} violation(s).`)
    process.exit(1)
  }

  console.log("✓ game-v2 dependency check passed (no forbidden imports).")
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
}
