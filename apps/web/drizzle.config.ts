import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { loadEnvConfig } from "@next/env"
import { defineConfig } from "drizzle-kit"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
loadEnvConfig(repoRoot)

// The app owns the migration for `@workspace/headcanon`'s receipt table, so its
// schema-only entry is scanned alongside the app's own tables — no re-export
// module under `schema/`. Resolve the public `/drizzle-schema` export (drizzle-orm
// only, so schema tooling never loads the executor graph) to a concrete path,
// since drizzle-kit globs files rather than package export specifiers.
const headcanonReceiptSchema = createRequire(import.meta.url).resolve(
  "@workspace/headcanon/drizzle-schema"
)

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL

if (!url) {
  throw new Error(
    "DATABASE_URL_UNPOOLED or DATABASE_URL must be set for drizzle-kit"
  )
}

export default defineConfig({
  dialect: "postgresql",
  schema: ["./lib/db/schema", headcanonReceiptSchema],
  out: "./lib/db/migrations",
  dbCredentials: { url },
})
