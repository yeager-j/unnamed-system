import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { loadEnvConfig } from "@next/env"
import type { NextConfig } from "next"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production", console, true)

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui"],
}

export default nextConfig
