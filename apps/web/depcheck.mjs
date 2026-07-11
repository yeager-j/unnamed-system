// @ts-check

import { readdirSync, readFileSync } from "node:fs"
import { join, posix, relative } from "node:path"
import process from "node:process"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  ENGINE_IMPORT_ALLOWLIST,
  ISOLATION_ALLOWLIST,
} from "./depcheck-allowlist.mjs"

const ROOT = fileURLToPath(new URL(".", import.meta.url))
// The presentation tiers, hard-gated against `@workspace/game*`. `domain/**` and
// `lib/**` are the two engine-facing tiers and are intentionally un-gated (by
// omission): the domain layer binds the catalog and re-exports engine reads;
// plumbing may reach the engine directly. Presentation reads through domain view
// builders instead. (`hooks/` retired in UNN-610 — every hook homed in a feature
// `_hooks/`, `domain/`, or `lib/sync/`.)
const GATED_ROOTS = ["app", "components"]
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]

// The four tiers, ranked for the direction gate (UNN-610). Presentation is
// stratified — `app` (feature routes) may use `components` (cross-feature kits),
// not the reverse — and sits above the two engine-facing data tiers, which are
// **peers**: `domain` composes `lib` (loaders, view builders read `lib/db`) and
// `lib` composes `domain` (server actions run domain Writers, queries return
// domain shapes), so neither can outrank the other. The one rule: nothing may
// import UP a rank, so data code never reaches into presentation.
const TIER_RANK = new Map([
  ["app", 0],
  ["components", 1],
  ["domain", 2],
  ["lib", 2],
])
const TIER_ROOTS = [...TIER_RANK.keys()]

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
 * Every module specifier imported by `source`, with its 1-based line — the
 * shared scanner both the engine gate and the tier gate read.
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
      const specifier = match[1]
      if (!specifier) continue
      found.push({ specifier, line: lineAt(scanned, match.index) })
    }
  }
  return found
}

/**
 * The tier a source file belongs to (its first path segment), or `null` for
 * everything outside the four tiers (config files, `public/`, `e2e/`, …).
 * @param {string} relPath POSIX path relative to apps/web
 * @returns {"app" | "components" | "domain" | "lib" | null}
 */
export function classifyTier(relPath) {
  const seg0 = relPath.split("/")[0] ?? ""
  return TIER_RANK.has(seg0) ? /** @type {any} */ (seg0) : null
}

/**
 * Resolves an import specifier to an apps/web-relative POSIX path, or `null` for
 * an external package (`@workspace/*`, `react`, `next`, …) the gate ignores.
 * `@/x` is the tsconfig alias for apps/web root; a relative specifier resolves
 * against the importer's directory.
 * @param {string} importerRel POSIX path relative to apps/web
 * @param {string} specifier
 * @returns {string | null}
 */
export function resolveSpecifier(importerRel, specifier) {
  if (specifier.startsWith("@/")) return specifier.slice(2)
  if (specifier.startsWith("."))
    return posix.normalize(posix.join(posix.dirname(importerRel), specifier))
  return null
}

/**
 * A `target` importing UP the tier gradient from `importer` — the forbidden
 * direction. Both must classify to a tier; `domain`/`lib` share rank 2, so their
 * mutual imports are never upward.
 * @param {string} importerRel POSIX path relative to apps/web
 * @param {string} targetRel POSIX path relative to apps/web
 * @returns {boolean}
 */
export function tierDirectionViolation(importerRel, targetRel) {
  const it = classifyTier(importerRel)
  const tt = classifyTier(targetRel)
  if (!it || !tt) return false
  const importerRank = TIER_RANK.get(it)
  const targetRank = TIER_RANK.get(tt)
  if (importerRank === undefined || targetRank === undefined) return false
  return targetRank < importerRank
}

/**
 * Feature isolation via the private-folder ancestry rule (Next.js `_`-folders):
 * an import into a `_`-prefixed private folder under `app/` is legal only from
 * within the directory that *contains* that folder. Keyed off the **outermost**
 * `_` segment, mirroring Next's routing privacy. `null`-tier targets and targets
 * with no private segment are unconstrained.
 * @param {string} importerRel POSIX path relative to apps/web
 * @param {string} targetRel POSIX path relative to apps/web
 * @returns {boolean}
 */
export function privateIsolationViolation(importerRel, targetRel) {
  if (!targetRel.startsWith("app/")) return false
  const segs = targetRel.split("/")
  const i = segs.findIndex((seg) => seg.startsWith("_"))
  if (i === -1) return false
  const parentDir = segs.slice(0, i).join("/")
  return !(
    importerRel === parentDir || importerRel.startsWith(`${parentDir}/`)
  )
}

/**
 * Every tier-gradient / feature-isolation violation in one file. Exported so the
 * gate's tests exercise both rules over plain strings, no filesystem. `kind`
 * splits the two rules: `direction` is zero-tolerance, `isolation` is
 * allowlist-grandfathered (pre-existing cross-feature reuse pending UNN-611).
 * @param {string} relPath POSIX path relative to apps/web
 * @param {string} source
 * @returns {{ file: string; line: number; specifier: string; kind: "direction" | "isolation"; rule: string }[]}
 */
export function scanTierViolations(relPath, source) {
  /** @type {{ file: string; line: number; specifier: string; kind: "direction" | "isolation"; rule: string }[]} */
  const violations = []
  for (const { specifier, line } of importSpecifiers(source)) {
    const target = resolveSpecifier(relPath, specifier)
    if (!target) continue
    if (tierDirectionViolation(relPath, target)) {
      violations.push({
        file: relPath,
        line,
        specifier,
        kind: "direction",
        rule: "tier direction — no upward import (app → components → domain ≈ lib)",
      })
    } else if (privateIsolationViolation(relPath, target)) {
      violations.push({
        file: relPath,
        line,
        specifier,
        kind: "isolation",
        rule: "feature isolation — a private _folder is importable only within its parent subtree",
      })
    }
  }
  return violations
}

/**
 * The domain-purity seam — functional core / imperative shell (UNN-610). A
 * `domain/` file that is NOT a marked-impure `use-*` (client hook) or `load-*`
 * (server loader) is the pure model/view core: it may import `@workspace/game*`
 * and other domain, but must not RUNTIME-import the impure `lib` plumbing tier.
 * The invariant this encodes: domain only READS
 * (`load-`) and REACTS (`use-`); it never WRITES persistence — mutations live in
 * `lib/actions`. When a new domain file needs `lib` at runtime the gate forces
 * the choice: mark it `use-`/`load-`, or move the impurity out.
 *
 * `import type` is exempt (erased at build → no runtime coupling). "Runtime
 * import" = a statement with ≥1 value specifier: a whole-statement `import type
 * {…}` and an all-inline-type `import { type A } …` both elide (exempt), while
 * `import { type A, b } …` counts (`b` is a value).
 */

/**
 * Test / fixture / law files are the imperative shell around the pure core — a
 * pure view builder's test may import `lib` freely.
 * @param {string} relPath POSIX path relative to apps/web
 * @returns {boolean}
 */
function isDomainTestFile(relPath) {
  return (
    /\.test\.tsx?$/.test(relPath) ||
    relPath.includes("/__fixtures__/") ||
    relPath.includes("/__laws__/")
  )
}

/**
 * Whether an import CLAUSE (the text between `import`/`export` and `from`) binds
 * only types, so the statement elides at build and creates no runtime coupling.
 * @param {string} clause
 * @returns {boolean}
 */
export function importClauseIsTypeOnly(clause) {
  const trimmed = clause.trim()
  if (/^type\b/.test(trimmed)) return true // `import type …` / `export type …`
  const brace = trimmed.match(/\{([^}]*)\}/)
  if (!brace) return false // default / namespace / bare specifier → a value binding
  const beforeBrace = trimmed
    .slice(0, trimmed.indexOf("{"))
    .replace(/,\s*$/, "")
    .trim()
  if (beforeBrace.length > 0) return false // a leading default/namespace value
  const specs = (brace[1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return specs.length > 0 && specs.every((s) => /^type\s/.test(s))
}

/**
 * Every domain-purity violation in one file (see the seam doc above). Exported so
 * the gate's tests exercise it over plain strings, no filesystem.
 * @param {string} relPath POSIX path relative to apps/web
 * @param {string} source
 * @returns {{ file: string; line: number; specifier: string; kind: "purity"; rule: string }[]}
 */
export function scanDomainPurity(relPath, source) {
  if (classifyTier(relPath) !== "domain" || isDomainTestFile(relPath)) return []
  // Marked-impure names: a client hook (`use-*`) or a loader (`load-*`, or bare
  // `load` where the folder supplies the noun — `character/load.ts`).
  const name = (relPath.split("/").pop() ?? "").replace(
    /\.(?:ts|tsx|js|jsx|mjs|cjs)$/,
    ""
  )
  if (name.startsWith("use-") || name === "load" || name.startsWith("load-"))
    return []

  const scanned = blankComments(source)
  /** @type {{ file: string; line: number; specifier: string; kind: "purity"; rule: string }[]} */
  const violations = []
  /**
   * @param {string} specifier
   * @param {number} index
   */
  const flag = (specifier, index) => {
    const target = resolveSpecifier(relPath, specifier)
    if (target && classifyTier(target) === "lib") {
      violations.push({
        file: relPath,
        line: lineAt(scanned, index),
        specifier,
        kind: "purity",
        rule: "domain purity — a non-use-/load- domain file may not runtime-import lib; use `import type`, or mark the file use-*/load-*",
      })
    }
  }

  const staticRe = /^[ \t]*(?:import|export)\b([^"';]*?)\bfrom\s*["']([^"']+)["']/gm
  let m
  while ((m = staticRe.exec(scanned)) !== null) {
    if (importClauseIsTypeOnly(m[1] ?? "")) continue
    if (m[2]) flag(m[2], m.index)
  }
  const sideEffectRe = /^[ \t]*import\s*["']([^"']+)["']/gm
  while ((m = sideEffectRe.exec(scanned)) !== null) {
    if (m[1]) flag(m[1], m.index)
  }
  const dynamicRe = /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g
  while ((m = dynamicRe.exec(scanned)) !== null) {
    if (m[1]) flag(m[1], m.index)
  }

  return violations
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

/**
 * Walks every tier (`app`, `components`, `domain`, `lib`) and collects tier
 * gradient / feature-isolation violations. Unlike the engine gate this is
 * **zero-tolerance** — the UNN-610 move makes the tree green by construction, so
 * there is nothing to grandfather — and it must scan the data tiers too, or an
 * upward `lib → components` / `domain → app` edge would be invisible. Also runs
 * the domain-purity check (zero-tolerance, `kind: "purity"`).
 * @returns {{ file: string; line: number; specifier: string; kind: "direction" | "isolation" | "purity"; rule: string }[]}
 */
function scanTierRoots() {
  /** @type {{ file: string; line: number; specifier: string; kind: "direction" | "isolation" | "purity"; rule: string }[]} */
  const violations = []
  for (const root of TIER_ROOTS) {
    for (const file of collectSourceFiles(join(ROOT, root))) {
      const relPath = relative(ROOT, file).split("\\").join("/")
      const source = readFileSync(file, "utf8")
      violations.push(...scanTierViolations(relPath, source))
      violations.push(...scanDomainPurity(relPath, source))
    }
  }
  return violations
}

function run() {
  const { files, violations } = scanGatedRoots()

  if (process.argv.includes("--print-allowlist")) {
    for (const file of files) console.log(file)
    return
  }

  const result = reconcileAllowlist(files, ENGINE_IMPORT_ALLOWLIST)

  // Tier gate. Direction violations are zero-tolerance (the UNN-610 move fixes
  // every upward data→presentation edge). Isolation violations are grandfathered
  // by file through a can-only-shrink allowlist: the pre-existing cross-feature
  // reuses (dungeon ⇢ maps canvas, dungeon ⇢ character-sheet cards) are real
  // extraction refactors deferred to UNN-611, not this pure move.
  const tierViolations = scanTierRoots()
  const zeroToleranceViolations = tierViolations.filter(
    (v) => v.kind === "direction" || v.kind === "purity"
  )
  const isolationFiles = [
    ...new Set(
      tierViolations.filter((v) => v.kind === "isolation").map((v) => v.file)
    ),
  ].sort((a, b) => a.localeCompare(b))
  const isolation = reconcileAllowlist(isolationFiles, ISOLATION_ALLOWLIST)

  const failed =
    result.newViolations.length > 0 ||
    result.staleEntries.length > 0 ||
    result.duplicateEntries.length > 0 ||
    !result.isSorted ||
    zeroToleranceViolations.length > 0 ||
    isolation.newViolations.length > 0 ||
    isolation.staleEntries.length > 0 ||
    isolation.duplicateEntries.length > 0 ||
    !isolation.isSorted

  if (!failed) {
    console.log(
      `✓ web dependency check passed (${files.length} grandfathered engine-import file(s); ` +
        `${ISOLATION_ALLOWLIST.length} grandfathered cross-feature file(s); tier gradient clean).`
    )
    return
  }

  console.error("✖ web dependency check failed:\n")
  for (const violation of zeroToleranceViolations) {
    console.error(
      `  Tier violation: ${violation.file}:${violation.line}  ${violation.specifier}\n    └─ ${violation.rule}`
    )
  }
  for (const file of isolation.newViolations) {
    console.error(
      `  New cross-feature import: ${file}\n    └─ move the shared code down a tier (kit/domain) or file it to UNN-611; do not allowlist new imports.`
    )
  }
  for (const file of isolation.staleEntries) {
    console.error(`  Stale isolation-allowlist entry: ${file}`)
  }
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
