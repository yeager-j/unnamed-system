import { describe, expect, it } from "vitest"

import {
  applyDamage,
  applyHeal,
  applyRecoverSP,
  applySpendSP,
  applyUsePrisma,
} from "@workspace/game/engine/character/adjust-pools"

describe("applyDamage", () => {
  it("subtracts the amount from current HP", () => {
    const result = applyDamage({ currentHP: 20 }, 5)
    expect(result).toEqual({ ok: true, value: { currentHP: 15 } })
  })

  it("floors at 0 instead of going negative (Fallen)", () => {
    const result = applyDamage({ currentHP: 3 }, 10)
    expect(result).toEqual({ ok: true, value: { currentHP: 0 } })
  })

  it("rejects a non-positive amount", () => {
    expect(applyDamage({ currentHP: 20 }, 0)).toEqual({
      ok: false,
      error: "non-positive-amount",
    })
    expect(applyDamage({ currentHP: 20 }, -3)).toEqual({
      ok: false,
      error: "non-positive-amount",
    })
  })
})

describe("applyHeal", () => {
  it("adds the amount to current HP", () => {
    const result = applyHeal({ currentHP: 5, maxHP: 20 }, 7)
    expect(result).toEqual({ ok: true, value: { currentHP: 12 } })
  })

  it("clamps at max HP", () => {
    const result = applyHeal({ currentHP: 18, maxHP: 20 }, 10)
    expect(result).toEqual({ ok: true, value: { currentHP: 20 } })
  })

  it("revives a Fallen character (heal from 0)", () => {
    const result = applyHeal({ currentHP: 0, maxHP: 20 }, 5)
    expect(result).toEqual({ ok: true, value: { currentHP: 5 } })
  })

  it("rejects a non-positive amount", () => {
    expect(applyHeal({ currentHP: 10, maxHP: 20 }, 0)).toEqual({
      ok: false,
      error: "non-positive-amount",
    })
  })
})

describe("applySpendSP", () => {
  it("subtracts the amount from current SP", () => {
    const result = applySpendSP({ currentSP: 20 }, 5)
    expect(result).toEqual({ ok: true, value: { currentSP: 15 } })
  })

  it("floors at 0", () => {
    const result = applySpendSP({ currentSP: 3 }, 10)
    expect(result).toEqual({ ok: true, value: { currentSP: 0 } })
  })

  it("rejects a non-positive amount", () => {
    expect(applySpendSP({ currentSP: 20 }, 0)).toEqual({
      ok: false,
      error: "non-positive-amount",
    })
  })
})

describe("applyRecoverSP", () => {
  it("adds the amount to current SP", () => {
    const result = applyRecoverSP({ currentSP: 5, maxSP: 50 }, 12)
    expect(result).toEqual({ ok: true, value: { currentSP: 17 } })
  })

  it("clamps at max SP", () => {
    const result = applyRecoverSP({ currentSP: 48, maxSP: 50 }, 10)
    expect(result).toEqual({ ok: true, value: { currentSP: 50 } })
  })

  it("rejects a non-positive amount", () => {
    expect(applyRecoverSP({ currentSP: 5, maxSP: 50 }, 0)).toEqual({
      ok: false,
      error: "non-positive-amount",
    })
  })
})

describe("applyUsePrisma", () => {
  it("decrements charges by 1", () => {
    expect(applyUsePrisma({ prismaCharges: 2 })).toEqual({
      ok: true,
      value: { prismaCharges: 1 },
    })
  })

  it("decrements to 0", () => {
    expect(applyUsePrisma({ prismaCharges: 1 })).toEqual({
      ok: true,
      value: { prismaCharges: 0 },
    })
  })

  it("refuses to drive charges below 0", () => {
    expect(applyUsePrisma({ prismaCharges: 0 })).toEqual({
      ok: false,
      error: "no-prisma-charges",
    })
  })
})
