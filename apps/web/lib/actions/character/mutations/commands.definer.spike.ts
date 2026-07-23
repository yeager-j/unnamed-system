import "server-only"

import { eq } from "drizzle-orm"

import type { DrizzleMutationTx } from "@workspace/headcanon/drizzle"
import {
  acceptMutation,
  allowMutation,
  allowMutationScreening,
  createMutationCommandDefiner,
  denyMutation,
  refuseMutation,
} from "@workspace/headcanon/next/server"

import { buildFinalizePatch } from "@/domain/character/commit/finalize"
import {
  characterEntityWrite,
  characterFinalize,
  characterIdentityWrite,
} from "@/domain/character/commit/protocol"
import { getArchetype, startingWeaponForLineage } from "@/domain/game-engine-v2"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import type { Actor } from "@/lib/auth/actor"
import { getDb, type WriteExecutor } from "@/lib/db/client"
import {
  loadPlayerCharacterById,
  type LoadedPlayerCharacter,
} from "@/lib/db/queries/load-player-character"
import { playerCharacter } from "@/lib/db/schema/player-character"

import {
  admitEntityWrite,
  commitAdmittedEntityWrite,
} from "../../entity/entity-row-store"
import {
  admitIdentityWrite,
  commitAdmittedIdentityWrite,
} from "../../entity/identity-store"
import {
  revalidateCharacterList,
  revalidateEntity,
} from "../../entity/revalidate"
import { advanceEntityAxisGuarded } from "../../entity/version-guard"

/**
 * UNN-688 spike, question 3 revisited: the definer-scoped command factory.
 * `createMutationCommandDefiner` fixes the app's actor/preflight/transaction
 * types once, so every command literal below is fully contextually typed with
 * no `satisfies` clause; projection and evidence infer from the literal's own
 * returns. This module is the spike twin of `commands.ts` — compare directly.
 * Delete or promote with the spike outcome.
 */
const defineEntityMutationCommand = createMutationCommandDefiner<
  Actor,
  ReturnType<typeof getDb>,
  DrizzleMutationTx<ReturnType<typeof getDb>>
>()

async function projectAcceptedEntityMutation(context: {
  readonly shortId: string
  readonly changesCharacterList: boolean
}): Promise<void> {
  revalidateEntity({ shortId: context.shortId })

  if (context.changesCharacterList) revalidateCharacterList()
}

export const entityWriteCommand = defineEntityMutationCommand(
  characterEntityWrite,
  {
    async screen({ executor, actor, args }) {
      const screened = await admitEntityWrite(executor, actor, args)
      return screened.ok
        ? allowMutationScreening({
            shortId: screened.value.pc.entity.shortId,
            versionClass: screened.value.versionClass,
          })
        : denyMutation()
    },
    async admit({ tx, actor, args }) {
      const admitted = await admitEntityWrite(tx, actor, args)
      return admitted.ok ? allowMutation(admitted.value) : denyMutation()
    },
    async execute({ tx, args, evidence, stamp }) {
      const committed = await commitAdmittedEntityWrite(
        tx,
        args,
        evidence,
        stamp
      )
      return committed.ok ? acceptMutation() : refuseMutation(committed.error)
    },
    finalizeAccepted({ args, projection }) {
      return projectAcceptedEntityMutation({
        shortId: projection.shortId,
        changesCharacterList:
          args.write.component === "level" ||
          args.write.component === "archetypes",
      })
    },
  }
)

export const entityIdentityCommand = defineEntityMutationCommand(
  characterIdentityWrite,
  {
    async screen({ executor, actor, args }) {
      const screened = await admitIdentityWrite(executor, actor, args)
      return screened.ok
        ? allowMutationScreening({ shortId: screened.value.pc.entity.shortId })
        : denyMutation()
    },
    async admit({ tx, actor, args }) {
      const admitted = await admitIdentityWrite(tx, actor, args)
      return admitted.ok ? allowMutation(admitted.value) : denyMutation()
    },
    async execute({ tx, args, evidence, stamp }) {
      await commitAdmittedIdentityWrite(tx, args, evidence, stamp)
      return acceptMutation()
    },
    finalizeAccepted({ args, projection }) {
      return projectAcceptedEntityMutation({
        shortId: projection.shortId,
        changesCharacterList:
          args.write.field === "name" || args.write.field === "portraitUrl",
      })
    },
  }
)

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

export const entityFinalizeCommand = defineEntityMutationCommand(
  characterFinalize,
  {
    async screen({ executor, actor, args }) {
      const screened = await admitFinalize(executor, actor, args.entityId)
      return screened.kind === "allowed"
        ? allowMutationScreening({
            shortId: screened.evidence.pc.entity.shortId,
          })
        : screened
    },
    admit: ({ tx, actor, args }) => admitFinalize(tx, actor, args.entityId),
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
    finalizeAccepted({ projection }) {
      return projectAcceptedEntityMutation({
        shortId: projection.shortId,
        changesCharacterList: true,
      })
    },
  }
)
