import { describe, expect, it } from "vitest"

import {
  PORTRAIT_MIME_TYPES,
  portraitBlobPathname,
} from "@/lib/storage/portrait-upload"

import { applyIdentityWrite, identityWritePatch } from "./identity"
import {
  identityWriteSchema,
  isStoredPortraitUrl,
  type IdentityWrite,
} from "./identity.schema"

const IDENTITY = {
  name: "Ortus",
  pronouns: "they/them",
  portraitUrl: "https://blob.example/portraits/a.png",
  notes: "Owes the ferryman.",
}

describe("identityWriteSchema", () => {
  it("trims the name and requires one", () => {
    expect(
      identityWriteSchema.parse({ field: "name", value: "  Vela  " })
    ).toEqual({ field: "name", value: "Vela" })
    expect(
      identityWriteSchema.safeParse({ field: "name", value: "   " }).success
    ).toBe(false)
  })

  it("bounds each field at its column's cap", () => {
    const tooLong = (length: number) => "x".repeat(length)
    expect(
      identityWriteSchema.safeParse({ field: "name", value: tooLong(65) })
        .success
    ).toBe(false)
    expect(
      identityWriteSchema.safeParse({ field: "pronouns", value: tooLong(65) })
        .success
    ).toBe(false)
    expect(
      identityWriteSchema.safeParse({ field: "notes", value: tooLong(8001) })
        .success
    ).toBe(false)
    expect(
      identityWriteSchema.safeParse({ field: "notes", value: tooLong(8000) })
        .success
    ).toBe(true)
  })

  it("admits null for every optional column", () => {
    for (const field of ["pronouns", "notes", "portraitUrl"] as const) {
      expect(
        identityWriteSchema.safeParse({ field, value: null }).success
      ).toBe(true)
    }
  })

  /**
   * The negative control for the no-transform rule: the client sends the args it
   * constructed and the authority parses them again, so anything the schema
   * *outputs* it must also *admit*. A canonicalizing transform here would produce
   * a `null` the second parse rejects, failing the mutation at the authority.
   */
  it("re-admits its own parsed output for every field", () => {
    const writes: IdentityWrite[] = [
      { field: "name", value: "  Vela  " },
      { field: "pronouns", value: "" },
      { field: "notes", value: "" },
      { field: "portraitUrl", value: null },
    ]

    for (const write of writes) {
      const once = identityWriteSchema.parse(write)
      expect(identityWriteSchema.parse(once)).toEqual(once)
    }
  })
})

/**
 * The portrait column is rendered as an avatar `src` on a publicly viewable
 * sheet, and the two-stage upload (Blob first, mutation second — a rerunnable
 * handler must not repeat the Blob write) means the URL now crosses the wire.
 * Without this grammar an owner could skip `uploadEntityPortraitAction` and aim
 * every viewer of their sheet at an arbitrary host. The cases below are the
 * refusals that matter; a grammar that is too *loose* is the dangerous drift,
 * so they carry more weight than the happy path.
 */
describe("stored portrait URL grammar", () => {
  const VALID =
    "https://mimg8r5obfnan5jk.public.blob.vercel-storage.com/portraits/06322513-fe53-4248-989b-54508507a27b.png"

  function admits(value: string): boolean {
    return identityWriteSchema.safeParse({ field: "portraitUrl", value })
      .success
  }

  it("admits a URL the upload path produced", () => {
    expect(admits(VALID)).toBe(true)
    expect(isStoredPortraitUrl(VALID)).toBe(true)
  })

  it("refuses every way of pointing the column somewhere else", () => {
    const refused = {
      "third-party host": "https://tracker.example/beacon.png",
      "host suffix near-miss":
        "https://evil.public.blob.vercel-storage.com.attacker.test/portraits/06322513-fe53-4248-989b-54508507a27b.png",
      "plaintext transport": VALID.replace("https:", "http:"),
      "non-image scheme": "javascript:alert(1)",
      "data URI": "data:image/png;base64,iVBORw0KGgo=",
      "path outside the portraits namespace":
        "https://mimg8r5obfnan5jk.public.blob.vercel-storage.com/exports/private.png",
      "non-uuid object name":
        "https://mimg8r5obfnan5jk.public.blob.vercel-storage.com/portraits/../../secret.png",
      "unexpected extension":
        "https://mimg8r5obfnan5jk.public.blob.vercel-storage.com/portraits/06322513-fe53-4248-989b-54508507a27b.svg",
      "tracking query": `${VALID}?viewer=me`,
      fragment: `${VALID}#x`,
      "embedded credentials": VALID.replace("https://", "https://user:pw@"),
      "not a URL": "not-a-url",
    }

    for (const [why, value] of Object.entries(refused)) {
      expect(admits(value), why).toBe(false)
    }
  })

  /**
   * The grammar and the minter are two homes for one shape, forced apart by
   * depcheck's domain-purity rule. This pins them together: if the Blob path or
   * the extension map changes, uploads would start producing URLs the protocol
   * refuses, and this goes red instead of the portrait silently failing to save.
   */
  it("admits what portraitBlobPathname mints, for every accepted mime", () => {
    for (const mime of PORTRAIT_MIME_TYPES) {
      const minted = `https://store123.public.blob.vercel-storage.com/${portraitBlobPathname(mime)}`
      expect(isStoredPortraitUrl(minted), mime).toBe(true)
    }
  })
})

describe("identityWritePatch", () => {
  it("sets exactly the written column", () => {
    expect(identityWritePatch({ field: "name", value: "Vela" })).toEqual({
      name: "Vela",
    })
    expect(identityWritePatch({ field: "portraitUrl", value: null })).toEqual({
      portraitUrl: null,
    })
  })

  it("canonicalizes a cleared optional column to null", () => {
    expect(identityWritePatch({ field: "pronouns", value: "  " })).toEqual({
      pronouns: null,
    })
    expect(identityWritePatch({ field: "notes", value: "" })).toEqual({
      notes: null,
    })
  })

  it("keeps a whitespace-bearing note verbatim", () => {
    // Notes is prose: only the empty string means "cleared", so an intentional
    // blank line or trailing space survives (unlike pronouns, which trims).
    expect(identityWritePatch({ field: "notes", value: "  " })).toEqual({
      notes: "  ",
    })
  })
})

describe("applyIdentityWrite", () => {
  it("folds the patch without touching sibling columns", () => {
    expect(
      applyIdentityWrite(IDENTITY, {
        field: "notes",
        value: "Paid the ferryman.",
      })
    ).toEqual({ ...IDENTITY, notes: "Paid the ferryman." })
  })

  it("is pure over its input", () => {
    applyIdentityWrite(IDENTITY, { field: "name", value: "Vela" })
    expect(IDENTITY.name).toBe("Ortus")
  })
})
