import { err, type Result } from "@workspace/result"

import { db, type WriteExecutor } from "@/lib/db/client"

/**
 * Composes several version-guarded writes into **one transaction** for the few
 * genuinely-atomic, cross-row gestures the Dungeon Map model needs — delve-start
 * (Dungeon + Instance), combat-start/end (Encounter + Instance [+ Dungeon]),
 * add/remove combatant (Encounter + Instance) — where a partial commit would
 * strand state (ADR — *Atomicity (Decision 5)*). The hot single-row paths do
 * **not** use this; they stay one guarded write.
 *
 * The novel bit over a bare `db.transaction`: the per-row guards report failure
 * by **returning** `err("stale" | "...-not-found")`, not by throwing — but the
 * neon driver only rolls back on a throw, so a guard that returns `err` after an
 * earlier guard already wrote would otherwise **commit** that earlier write.
 * `guardMany` closes that gap: `body` composes the guards with ordinary early
 * returns, and if it returns any `err`, `guardMany` throws to roll the whole
 * transaction back, then surfaces that same `err` as the result. An `ok` body
 * commits. A non-guard exception propagates unchanged (a real failure, not a
 * guard verdict).
 *
 * `body` receives the transaction executor; pass it to each guarded write
 * (`saveEncounterSession(…, tx)`, `saveMapInstanceState(tx, …)`) so they share
 * the one snapshot.
 *
 * @example
 * guardMany(async (tx) => {
 *   const enc = await saveEncounterSession(encounterId, session, encVersion, tx)
 *   if (!enc.ok) return enc
 *   const inst = await saveMapInstanceState(tx, instanceId, state, instVersion)
 *   if (!inst.ok) return inst
 *   return ok({ encounter: enc.value, instance: inst.value })
 * })
 */
export async function guardMany<T, E>(
  body: (tx: WriteExecutor) => Promise<Result<T, E>>
): Promise<Result<T, E>> {
  try {
    return await db.transaction(async (tx) => {
      const result = await body(tx)
      if (!result.ok) throw new GuardManyRollback(result.error)
      return result
    })
  } catch (error) {
    if (error instanceof GuardManyRollback) {
      return err(error.guardError as E)
    }
    throw error
  }
}

/**
 * Sentinel thrown to force a transaction rollback when a composed guard returns
 * `err`. Carries the guard's error so {@link guardMany} can surface it verbatim;
 * never escapes the module.
 */
class GuardManyRollback extends Error {
  constructor(readonly guardError: unknown) {
    super("guardMany: rolling back on a guard failure")
    this.name = "GuardManyRollback"
  }
}
