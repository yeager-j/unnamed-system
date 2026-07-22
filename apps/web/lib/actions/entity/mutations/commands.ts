import "server-only"

import { eq } from "drizzle-orm"

import { revisionAt, type AcceptedStamp } from "@workspace/headcanon"
import type { DrizzleMutationTx } from "@workspace/headcanon/drizzle"
import {
  acceptMutation,
  allowMutation,
  denyMutation,
  refuseMutation,
  type MutationCommand,
} from "@workspace/headcanon/next/server"

import {
  entityFinalize,
  entityIdentity,
  entityWrite,
} from "@/domain/entity/commit/protocol"
import { buildFinalizePatch } from "@/domain/entity/finalize"
import { getArchetype, startingWeaponForLineage } from "@/domain/game-engine-v2"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import type { Actor } from "@/lib/auth/actor"
import { entityAxisFor } from "@/lib/db/axes"
import { getDb, type WriteExecutor } from "@/lib/db/client"
import {
  loadPlayerCharacterById,
  type LoadedPlayerCharacter,
} from "@/lib/db/queries/load-player-character"
import { playerCharacter } from "@/lib/db/schema/player-character"
import type { VersionClass } from "@/lib/db/version-classes"
import { publishCharacterPing } from "@/lib/realtime/publish"

import {
  admitEntityWrite,
  commitAdmittedEntityWrite,
  type AdmittedEntityWrite,
} from "../entity-row-store"
import {
  admitIdentityWrite,
  commitAdmittedIdentityWrite,
  type AdmittedIdentityWrite,
} from "../identity-store"
import { revalidateCharacterList, revalidateEntity } from "../revalidate"
import { advanceEntityAxisGuarded } from "../version-guard"

type EntityMutationTx = DrizzleMutationTx<ReturnType<typeof getDb>>
type EntityMutationPreflight = ReturnType<typeof getDb>

async function projectAcceptedEntityMutation(context: {
  readonly entityId: string
  readonly shortId: string
  readonly versionClass: VersionClass
  readonly stamp: AcceptedStamp
  readonly changesCharacterList: boolean
}): Promise<void> {
  // Character loads still use React `cache()`, so the package's axis-tag expiry
  // cannot refresh this subtree yet. Keep the explicit projection until the
  // loader adopts `tagVersionedBase`.
  revalidateEntity({ shortId: context.shortId })

  const stampedRevision = revisionAt(
    context.stamp.revisions,
    entityAxisFor[context.versionClass](context.entityId)
  )
  if (stampedRevision !== undefined) {
    // Transitional bridge for dungeon watchers which still subscribe to the
    // legacy character channel. The combat root observes this axis directly.
    publishCharacterPing(context.shortId, "entity", {
      [context.versionClass]: stampedRevision,
    })
  }

  if (context.changesCharacterList) revalidateCharacterList()
}

export const entityWriteCommand = {
  async admit({ executor, actor, args }) {
    const admitted = await admitEntityWrite(executor, actor, args)
    return admitted.ok ? allowMutation(admitted.value) : denyMutation()
  },
  async execute({ tx, args, evidence, stamp }) {
    const committed = await commitAdmittedEntityWrite(tx, args, evidence, stamp)
    return committed.ok ? acceptMutation() : refuseMutation(committed.error)
  },
  afterAccepted({ args, stamp, preflight }) {
    return projectAcceptedEntityMutation({
      entityId: args.entityId,
      shortId: preflight.pc.entity.shortId,
      versionClass: preflight.versionClass,
      stamp,
      changesCharacterList:
        args.write.component === "level" ||
        args.write.component === "archetypes",
    })
  },
} satisfies MutationCommand<
  typeof entityWrite,
  Actor,
  EntityMutationPreflight,
  EntityMutationTx,
  AdmittedEntityWrite
>

export const entityIdentityCommand = {
  async admit({ executor, actor, args }) {
    const admitted = await admitIdentityWrite(executor, actor, args)
    return admitted.ok ? allowMutation(admitted.value) : denyMutation()
  },
  async execute({ tx, args, evidence, stamp }) {
    await commitAdmittedIdentityWrite(tx, args, evidence, stamp)
    return acceptMutation()
  },
  afterAccepted({ args, stamp, preflight }) {
    return projectAcceptedEntityMutation({
      entityId: args.entityId,
      shortId: preflight.pc.entity.shortId,
      versionClass: "identity",
      stamp,
      changesCharacterList:
        args.write.field === "name" || args.write.field === "portraitUrl",
    })
  },
} satisfies MutationCommand<
  typeof entityIdentity,
  Actor,
  EntityMutationPreflight,
  EntityMutationTx,
  AdmittedIdentityWrite
>

interface AdmittedFinalize {
  readonly pc: LoadedPlayerCharacter
}

async function admitFinalize(
  executor: WriteExecutor,
  actor: Actor,
  entityId: string
) {
  const pc = await loadPlayerCharacterById(entityId, executor)
  if (!pc || pc.userId !== actor.userId) return denyMutation()
  return allowMutation<AdmittedFinalize>({ pc })
}

export const entityFinalizeCommand = {
  admit: ({ executor, actor, args }) =>
    admitFinalize(executor, actor, args.entityId),
  async execute({ tx, evidence, stamp }) {
    if (evidence.pc.status !== "draft") {
      return refuseMutation("entity-not-draft" as const)
    }

    const loaded = loadEntityRow(evidence.pc.entity)
    if (!loaded.ok) return refuseMutation("entity-load-failed" as const)

    const patch = buildFinalizePatch(
      evidence.pc.entity.name,
      loaded.value.components,
      {
        getArchetype,
        startingWeaponForLineage,
        newId: () => crypto.randomUUID(),
      }
    )
    if (!patch.ok) return refuseMutation(patch.error)

    const { status, ...entityPatch } = patch.value
    await advanceEntityAxisGuarded(
      tx,
      evidence.pc.entity,
      "identity",
      entityPatch,
      stamp
    )
    await tx
      .update(playerCharacter)
      .set({ status })
      .where(eq(playerCharacter.entityId, evidence.pc.entity.id))

    return acceptMutation()
  },
  afterAccepted({ args, stamp, preflight }) {
    return projectAcceptedEntityMutation({
      entityId: args.entityId,
      shortId: preflight.pc.entity.shortId,
      versionClass: "identity",
      stamp,
      changesCharacterList: true,
    })
  },
} satisfies MutationCommand<
  typeof entityFinalize,
  Actor,
  EntityMutationPreflight,
  EntityMutationTx,
  AdmittedFinalize
>
