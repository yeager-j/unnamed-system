import { describe, expect, it } from "vitest"

import {
  foldSnapshotVersion,
  type SnapshotVersionInputs,
} from "./snapshot-version"

const base = (): SnapshotVersionInputs => ({
  encounterVersion: 3,
  instanceVersion: 5,
  durableVersions: new Map([
    ["char-a", 7],
    ["char-b", 2],
  ]),
})

describe("foldSnapshotVersion — any constituent bump changes the fold (UNN-530 AC)", () => {
  it("is deterministic for identical inputs, regardless of Map insertion order", () => {
    const reordered: SnapshotVersionInputs = {
      ...base(),
      durableVersions: new Map([
        ["char-b", 2],
        ["char-a", 7],
      ]),
    }
    expect(foldSnapshotVersion(base())).toBe(foldSnapshotVersion(reordered))
  })

  it("changes when the encounter version bumps", () => {
    expect(foldSnapshotVersion({ ...base(), encounterVersion: 4 })).not.toBe(
      foldSnapshotVersion(base())
    )
  })

  it("changes when the instance version bumps", () => {
    expect(foldSnapshotVersion({ ...base(), instanceVersion: 6 })).not.toBe(
      foldSnapshotVersion(base())
    )
  })

  it("changes when any single durable vitalsVersion bumps", () => {
    const bumped: SnapshotVersionInputs = {
      ...base(),
      durableVersions: new Map([
        ["char-a", 8],
        ["char-b", 2],
      ]),
    }
    expect(foldSnapshotVersion(bumped)).not.toBe(foldSnapshotVersion(base()))
  })

  it("changes when a durable participant joins or leaves", () => {
    const joined: SnapshotVersionInputs = {
      ...base(),
      durableVersions: new Map([...base().durableVersions, ["char-c", 1]]),
    }
    const left: SnapshotVersionInputs = {
      ...base(),
      durableVersions: new Map([["char-a", 7]]),
    }
    expect(foldSnapshotVersion(joined)).not.toBe(foldSnapshotVersion(base()))
    expect(foldSnapshotVersion(left)).not.toBe(foldSnapshotVersion(base()))
  })

  it("does not collide when one dimension trades a bump for another's", () => {
    const traded: SnapshotVersionInputs = {
      ...base(),
      encounterVersion: base().encounterVersion + 1,
      instanceVersion: base().instanceVersion - 1,
    }
    expect(foldSnapshotVersion(traded)).not.toBe(foldSnapshotVersion(base()))
  })
})
