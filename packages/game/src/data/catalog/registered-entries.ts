import { readdirSync } from "node:fs"
import { join } from "node:path"

/** A catalog entry: any object carrying a string `key`. Every catalog entry
 *  file exports exactly one of these. */
function isCatalogEntry(value: unknown): value is { key: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "key" in value &&
    typeof (value as { key: unknown }).key === "string"
  )
}

/**
 * Resolves the absolute paths of a catalog's entry files: every `*.ts` under a
 * category subfolder of `catalogDir`, excluding the registry's own top-level
 * files (registry / schema / index / utils / mutate), the per-category slice
 * `index.ts`, and tests. Entry files always live in a category subfolder
 * (`skills/fire/agi.ts`, `enemies/5e/humanoid/goblin.ts`), so anything sitting
 * directly in `catalogDir` is registry plumbing, not an entry.
 */
function entryFilePaths(catalogDir: string): string[] {
  const paths: string[] = []

  for (const dirent of readdirSync(catalogDir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!dirent.isFile()) continue
    if (dirent.parentPath === catalogDir) continue

    const { name } = dirent
    if (!name.endsWith(".ts")) continue
    if (name.endsWith(".test.ts")) continue
    if (name === "index.ts") continue

    paths.push(join(dirent.parentPath, name))
  }

  return paths
}

/**
 * Imports every catalog entry file under `catalogDir` and returns them keyed by
 * absolute path. The dynamic imports resolve to the same module singletons the
 * registry imported, so {@link findUnregisteredEntries} can compare by identity.
 * The filesystem walk (rather than reading the registry) is what lets the
 * meta-test see a file that exists on disk but was never registered.
 */
export async function loadCatalogEntryModules(
  catalogDir: string
): Promise<Record<string, Record<string, unknown>>> {
  const modules: Record<string, Record<string, unknown>> = {}

  for (const path of entryFilePaths(catalogDir)) {
    modules[path] = (await import(path)) as Record<string, unknown>
  }

  return modules
}

/**
 * Given entry modules keyed by path, returns the paths whose exported entry is
 * missing from — or not identical to — the catalog. An empty array means every
 * entry file on disk is registered.
 *
 * Backs each catalog's "registers every entry file on disk" meta-test, which
 * closes the silent forget-to-register gap: an entry file that's never spread
 * into its registry resolves to `undefined` (or a different object) here and
 * gets named.
 */
export function findUnregisteredEntries(
  modules: Record<string, Record<string, unknown>>,
  get: (key: string) => unknown
): string[] {
  const unregistered: string[] = []

  for (const [path, module] of Object.entries(modules)) {
    for (const value of Object.values(module)) {
      if (isCatalogEntry(value) && get(value.key) !== value) {
        unregistered.push(`${path} (key: "${value.key}")`)
      }
    }
  }

  return unregistered
}
