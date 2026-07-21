"use server"

import { forbidden } from "next/navigation"

import { revisionAt } from "@workspace/headcanon"

import { ENTITY_WRITERS } from "@/domain/entity/commit/writers"
import { requireActor } from "@/lib/auth/actor"
import { requireEntityOwner } from "@/lib/auth/campaign-access"
import { entityAxisFor } from "@/lib/db/axes"
import type { VersionClass } from "@/lib/db/version-classes"
import { publishCharacterPing } from "@/lib/realtime/publish"

import {
  isEntityWriteAuthRejection,
  requireEntityWriteAuthorized,
} from "../authorize-write"
import { revalidateCharacterList, revalidateEntity } from "../revalidate"
import { parseEntityWriteTarget, parseIdentityWriteTarget } from "./authorize"
import { executeEntityMutation } from "./executor"

/**
 * The Headcanon **entity door** (UNN-673/UNN-674; the one door for both
 * registered mutations since UNN-676) — the app-owned Server Action a character
 * surface's predicted root delivers every envelope through. Its jobs are
 * authentication, a cheap fail-closed authorization pre-check, and the
 * projections the executor's axis finalization does not cover:
 *
 * - `requireActor()` derives the trusted actor (authentication);
 * - the pre-check runs the same authorization the handler reruns —
 *   `requireEntityWriteAuthorized` for `entity.write`, `requireEntityOwner` for
 *   `entity.identity` — tripping `forbidden()` *before* the executor claims a
 *   receipt or takes a lock, so an unauthorized caller writes no receipt;
 * - the executor owns dedup, the transactional handler (which reruns the
 *   authorization inside its attempt), contention retry, axis cache-tag expiry,
 *   route refresh, and axis invalidation publication;
 * - a rare race where the handler's in-transaction authorization refuses after the
 *   pre-check passed surfaces as a rejected outcome — translated back to
 *   `forbidden()` so the 403 contract holds;
 * - level/Archetype/name/portrait changes revalidate the My Characters summary,
 *   an *additional* projection that does not observe the mutated axes; and
 * - the **legacy ping bridge**: the combat console and dungeon watch still
 *   reconcile through `character:{shortId}` pings, not axis invalidations, so an
 *   accepted mutation republishes its advanced class on that channel. Deleted
 *   when Phase 3a moves those bindings onto the axis subscription.
 *
 * The wire carries only `{ protocol, mutationId, invocation }` — no expected
 * revision, lane, axis, actor, or storage-home. The actor is derived here; the
 * axis, class, and storage home are derived by the authority.
 */
export async function applyEntityMutationAction(envelope: unknown) {
  const actor = await requireActor()

  const write = parseEntityWriteTarget(envelope)
  const identity = write ? null : parseIdentityWriteTarget(envelope)

  let bridge: {
    entityId: string
    shortId: string
    versionClass: VersionClass
  } | null = null

  if (write) {
    const pc = await requireEntityWriteAuthorized(
      actor,
      write.entityId,
      write.write
    )
    bridge = {
      entityId: write.entityId,
      shortId: pc.entity.shortId,
      versionClass: ENTITY_WRITERS[write.write.component].durableClass,
    }
  } else if (identity) {
    const { entity: row } = await requireEntityOwner(identity.entityId)
    bridge = {
      entityId: identity.entityId,
      shortId: row.shortId,
      versionClass: "identity",
    }
  }

  const outcome = await executeEntityMutation(envelope, actor)

  // A race can let the handler's authoritative in-transaction authorization refuse
  // after the door's pre-check passed (e.g. placement changed). Preserve the 403.
  if (
    outcome.ok &&
    outcome.value.kind === "rejected" &&
    isEntityWriteAuthRejection(outcome.value.error)
  ) {
    forbidden()
  }

  if (outcome.ok && outcome.value.kind === "accepted" && bridge) {
    // The character subtree still needs an explicit path revalidation, because
    // the executor's axis finalization cannot reach it: `updateTag` only
    // expires `"use cache"` entries carrying the axis tag, and this app's
    // character loader is React `cache()` (per-request memoization), so no
    // cached entry is tagged with the axis at all. Server components that
    // *derive* props from entity state therefore go stale — the builder's
    // Continue gate (`nextGateForStep` over `loaded.entity.components`) is the
    // one an e2e caught. The predicted root reconciles the client's own
    // projection; this reconciles the server's. It disappears when the loader
    // adopts `tagVersionedBase` and the tag convention becomes load-bearing.
    revalidateEntity({ shortId: bridge.shortId })

    const revision = revisionAt(
      outcome.value.stamp.revisions,
      entityAxisFor[bridge.versionClass](bridge.entityId)
    )
    if (revision !== undefined) {
      publishCharacterPing(bridge.shortId, "entity", {
        [bridge.versionClass]: revision,
      })
    }
  }

  // Summary-list projections that do not observe the entity's own axes: reuse
  // the same helper the retired standalone doors did (it revalidates `/`,
  // where the list renders). Everything else is reconciled by the executor.
  const changesCharacterList = write
    ? write.write.component === "level" ||
      write.write.component === "archetypes"
    : identity
      ? identity.write.field === "name" ||
        identity.write.field === "portraitUrl"
      : false
  if (outcome.ok && changesCharacterList) {
    revalidateCharacterList()
  }

  return outcome
}
