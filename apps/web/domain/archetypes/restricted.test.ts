import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { hiddenArchetypeKeysFor, isArchetypeAllowedFor } from "./restricted"

// The module guards itself with `server-only`, which throws outside a
// server-component module graph; neutralize it so the pure allowlist logic can
// be exercised directly. `vi.mock` is hoisted above the import above.
vi.mock("server-only", () => ({}))

const ENV_KEY = "ELEMENTAL_THIEF_EMAILS"
const RESTRICTED_KEY = "elemental-thief"

let original: string | undefined

beforeEach(() => {
  original = process.env[ENV_KEY]
  delete process.env[ENV_KEY]
})

afterEach(() => {
  if (original === undefined) delete process.env[ENV_KEY]
  else process.env[ENV_KEY] = original
})

describe("isArchetypeAllowedFor", () => {
  it("is fail-closed: a restricted key is denied when the allowlist env var is unset", () => {
    expect(isArchetypeAllowedFor(RESTRICTED_KEY, "a@b.com")).toBe(false)
  })

  it("allows an email on the allowlist", () => {
    process.env[ENV_KEY] = "a@b.com"
    expect(isArchetypeAllowedFor(RESTRICTED_KEY, "a@b.com")).toBe(true)
  })

  it("matches case- and whitespace-insensitively on both sides", () => {
    process.env[ENV_KEY] = "  A@B.com "
    expect(isArchetypeAllowedFor(RESTRICTED_KEY, " a@b.COM ")).toBe(true)
  })

  it("ignores empty entries in a comma-separated allowlist", () => {
    process.env[ENV_KEY] = "a@b.com, ,"
    expect(isArchetypeAllowedFor(RESTRICTED_KEY, "a@b.com")).toBe(true)
    expect(isArchetypeAllowedFor(RESTRICTED_KEY, "")).toBe(false)
  })

  it("denies a non-allowlisted email", () => {
    process.env[ENV_KEY] = "a@b.com"
    expect(isArchetypeAllowedFor(RESTRICTED_KEY, "other@b.com")).toBe(false)
  })

  it("denies a null, undefined, or empty email", () => {
    process.env[ENV_KEY] = "a@b.com"
    expect(isArchetypeAllowedFor(RESTRICTED_KEY, null)).toBe(false)
    expect(isArchetypeAllowedFor(RESTRICTED_KEY, undefined)).toBe(false)
    expect(isArchetypeAllowedFor(RESTRICTED_KEY, "")).toBe(false)
  })

  it("always allows an unrestricted Archetype, regardless of email", () => {
    expect(isArchetypeAllowedFor("thief", null)).toBe(true)
    expect(isArchetypeAllowedFor("thief", "anyone@b.com")).toBe(true)
  })
})

describe("hiddenArchetypeKeysFor", () => {
  it("hides the restricted Archetype when the allowlist is unset (fail-closed)", () => {
    expect(hiddenArchetypeKeysFor("a@b.com")).toContain(RESTRICTED_KEY)
  })

  it("reveals it to an allowlisted viewer", () => {
    process.env[ENV_KEY] = "a@b.com"
    expect(hiddenArchetypeKeysFor("a@b.com")).not.toContain(RESTRICTED_KEY)
  })

  it("hides it from a non-allowlisted viewer", () => {
    process.env[ENV_KEY] = "a@b.com"
    expect(hiddenArchetypeKeysFor("other@b.com")).toContain(RESTRICTED_KEY)
  })

  it("hides it from a signed-out (null) viewer", () => {
    process.env[ENV_KEY] = "a@b.com"
    expect(hiddenArchetypeKeysFor(null)).toContain(RESTRICTED_KEY)
  })
})
