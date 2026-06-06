import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { loadEnvConfig } from "@next/env"
import type { NextConfig } from "next"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production", console, true)

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/game", "@workspace/ui"],
  /**
   * Auto-memoizes components and hook return values via
   * `babel-plugin-react-compiler`. Removes the need for hand-rolled
   * `useCallback` / `React.memo` to keep returned APIs from churning across
   * renders (e.g. the function surface of `useDebouncedAutoSave`). Per-file
   * opt-out via the `'use no memo'` directive if a regression appears.
   * Top-level in Next 16 (promoted out of `experimental`).
   */
  reactCompiler: true,
  experimental: {
    /**
     * Enables `forbidden()` / `unauthorized()` from `next/navigation` so
     * `lib/auth/viewer-role.ts#requireOwner` can return a real HTTP 403 from
     * Server Actions instead of a generic 500. See Next 16 docs on
     * authInterrupts.
     */
    authInterrupts: true,
  },
  images: {
    remotePatterns: [
      new URL("https://avatar.vercel.sh/**"),
      // Uploaded character portraits (UNN-204). Each Vercel Blob store gets
      // its own `*.public.blob.vercel-storage.com` subdomain, so the host
      // pattern is a wildcard rather than the literal store hostname.
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
}

export default nextConfig
