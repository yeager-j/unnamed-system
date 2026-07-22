/**
 * Server-owned realtime namespace naming. Headcanon derives hashed axis channel
 * names beneath this deployment-specific namespace.
 */

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
export function realtimeNamespace(): string {
  if (process.env.VERCEL_ENV === "production") return "prod"
  if (process.env.VERCEL_ENV === "preview") {
    const slug = slugify(process.env.VERCEL_GIT_COMMIT_REF ?? "")
    return `pr-${slug || "unknown"}`
  }
  return "dev"
}
