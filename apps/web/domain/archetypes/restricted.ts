import "server-only"

/**
 * Per-user visibility gating for otherwise-shipped Archetypes.
 *
 * The Elemental Thief ships to Production but is visible and unlockable only to
 * the email addresses listed in its allowlist env var. The allowlist lives in
 * the environment — never in source control — so a player's email (the gift is
 * for a minor) is not committed to a public repo. An unset env var means an
 * empty allowlist, i.e. the Archetype is hidden from **everyone** (fail-closed).
 *
 * Two consumers:
 *  - the Atlas page computes {@link hiddenArchetypeKeysFor} for the viewer and
 *    passes the keys to `buildLineageAtlas`, which drops them from the tree;
 *  - the registered entity mutation command re-checks
 *    {@link hiddenArchetypeKeysFor} before a `spendArchetypeRank` write, so a
 *    tampered request cannot unlock a restricted Archetype the viewer may not
 *    see (the pure Writer is catalog-only and runs on the client too).
 *
 * Server-only: it reads `process.env`, so it must never reach the client bundle
 * (the Atlas client component receives the resolved key list as a prop).
 */

/** Restricted Archetype key → the env var holding its comma-separated email
 *  allowlist. */
const RESTRICTED_ARCHETYPE_ENV: Record<string, string> = {
  "elemental-thief": "ELEMENTAL_THIEF_EMAILS",
}

function normalizeEmail(email: string | null | undefined): string | undefined {
  return email?.trim().toLowerCase() || undefined
}

function allowlistFor(archetypeKey: string): readonly string[] | undefined {
  const envName = RESTRICTED_ARCHETYPE_ENV[archetypeKey]
  if (!envName) return undefined
  return (process.env[envName] ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Whether `email` may see and unlock `archetypeKey`. Unrestricted Archetypes
 * are always allowed; a restricted one requires the (normalized) email to be on
 * its allowlist.
 */
export function isArchetypeAllowedFor(
  archetypeKey: string,
  email: string | null | undefined
): boolean {
  const allowlist = allowlistFor(archetypeKey)
  if (!allowlist) return true
  const normalized = normalizeEmail(email)
  return normalized !== undefined && allowlist.includes(normalized)
}

/**
 * The keys of every restricted Archetype `email` may **not** see — handed to
 * `buildLineageAtlas` so the Atlas omits them for non-allowlisted viewers.
 */
export function hiddenArchetypeKeysFor(
  email: string | null | undefined
): string[] {
  return Object.keys(RESTRICTED_ARCHETYPE_ENV).filter(
    (key) => !isArchetypeAllowedFor(key, email)
  )
}
