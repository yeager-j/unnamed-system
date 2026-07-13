import { describe, expect, it } from "vitest"

import {
  decodeChronicleCursor,
  encodeChronicleCursor,
} from "./load-campaign-updates"

/**
 * Pins the Chronicle cursor token (UNN-580): opaque on the wire, but the
 * round-trip must be exact — the keyset predicate compares the decoded
 * triple against DB values, so any drift (timestamp precision, field loss)
 * silently skips or repeats rows at page boundaries.
 */
describe("chronicle cursor", () => {
  it("round-trips the (day, authoredAt, id) triple exactly", () => {
    const row = {
      day: 14,
      authoredAt: new Date("2026-07-12T22:12:19.840Z"),
      id: "0b9e5ccd-1811-4a64-bec0-d02e4b482ddd",
    }
    expect(decodeChronicleCursor(encodeChronicleCursor(row))).toEqual(row)
  })

  it("returns null for garbage instead of throwing (tampered wire input)", () => {
    expect(decodeChronicleCursor("not-base64url!")).toBeNull()
    expect(decodeChronicleCursor("")).toBeNull()
    expect(
      decodeChronicleCursor(Buffer.from("[1,2,3]").toString("base64url"))
    ).toBeNull()
    expect(
      decodeChronicleCursor(
        Buffer.from(JSON.stringify({ d: "14", a: "x", i: 3 })).toString(
          "base64url"
        )
      )
    ).toBeNull()
    expect(
      decodeChronicleCursor(
        Buffer.from(
          JSON.stringify({ d: 14, a: "not-a-date", i: "u1" })
        ).toString("base64url")
      )
    ).toBeNull()
  })
})
