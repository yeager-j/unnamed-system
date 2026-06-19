/**
 * Server-owned realtime channel naming (realtime ADR, Decision 7). The full
 * channel name is `{namespace}:{domain}:{shortId}`, where the namespace is
 * derived from the deployment environment so identically-seeded PR previews —
 * which collide on shortIds by construction — can't cross-talk. This module is
 * the **only** place channel names are assembled: the publish helper composes
 * through it, and the token route resolves names server-side so clients never
 * see (or need) the namespace.
 */

export type RealtimeDomain = "character" | "encounter" | "dungeon"

/**
 * Collapses a git ref to channel-safe characters: lowercase, every run outside
 * `[a-z0-9]` becomes a single `-`, leading/trailing `-` trimmed. Refs routinely
 * contain `/` (e.g. `claude/unn-370-realtime`), which Ably would otherwise
 * accept but the namespace convention reserves `:` and keeps flat.
 */
function slugify(ref: string): string {
  return ref
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * The environment namespace: `prod` in production, `pr-<slugified branch>` on
 * a Vercel preview (per-PR isolation inside the shared Ably app), `dev`
 * everywhere else (local dev — parallel worktrees share the local database, so
 * sharing the namespace is correct). Read from `process.env` at call time so
 * tests can stub the environment per case.
 */
function namespace(): string {
  if (process.env.VERCEL_ENV === "production") return "prod"
  if (process.env.VERCEL_ENV === "preview") {
    const slug = slugify(process.env.VERCEL_GIT_COMMIT_REF ?? "")
    return `pr-${slug || "unknown"}`
  }
  return "dev"
}

/** The fully-qualified Ably channel name for an entity's invalidation pings. */
export function realtimeChannelName(
  domain: RealtimeDomain,
  shortId: string
): string {
  return `${namespace()}:${domain}:${shortId}`
}
