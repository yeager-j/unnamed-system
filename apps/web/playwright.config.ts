import { defineConfig, devices } from "@playwright/test"

const isCI = !!process.env.CI
const baseURL = process.env.BASE_URL ?? "http://localhost:3000"

// Vercel Deployment Protection 401s every preview request. The automation
// bypass secret lets CI through while previews stay protected for humans.
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const extraHTTPHeaders = bypassSecret
  ? {
      "x-vercel-protection-bypass": bypassSecret,
      "x-vercel-set-bypass-cookie": "true",
    }
  : undefined

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/auth.setup.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    extraHTTPHeaders,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
})
