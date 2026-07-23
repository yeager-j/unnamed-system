import "server-only"

import { revalidatePath } from "next/cache"

import type { StampAccumulator } from "@workspace/headcanon"
import { throwMutationContention } from "@workspace/headcanon/drizzle"
import {
  acceptMutation,
  allowMutation,
  allowMutationScreening,
  denyMutation,
  refuseMutation,
} from "@workspace/headcanon/next/server"

import {
  templateSetEvents,
  templateSetRename,
} from "@/domain/template-set/commit/protocol"
import { reduceTemplateSetEvents } from "@/domain/template-set/events"
import type { ShowtimeMutationCommand } from "@/lib/actions/mutations/environment"
import type { Actor } from "@/lib/auth/actor"
import { templateSetAxis } from "@/lib/db/axes"
import type { WriteExecutor } from "@/lib/db/client"
import { loadTemplateSetRowById } from "@/lib/db/queries/load-template-set"
import type { TemplateSetRow } from "@/lib/db/schema/template-set"
import {
  renameTemplateSet,
  saveTemplateSetContent,
} from "@/lib/db/writes/template-set"
import { stageSetPath, stageSetsPath } from "@/lib/paths"

type TemplateSetMutation = typeof templateSetRename | typeof templateSetEvents
type TemplateSetMutationCommand<Mutation extends TemplateSetMutation> =
  ShowtimeMutationCommand<
    Mutation,
    { readonly shortId: string },
    TemplateSetRow
  >

async function admitTemplateSet(
  executor: WriteExecutor,
  actor: Actor,
  templateSetId: string
) {
  const set = await loadTemplateSetRowById(templateSetId, executor)
  return set && set.userId === actor.userId
    ? allowMutation(set)
    : denyMutation()
}

async function screenTemplateSet(
  executor: WriteExecutor,
  actor: Actor,
  templateSetId: string
) {
  const admitted = await admitTemplateSet(executor, actor, templateSetId)
  return admitted.kind === "allowed"
    ? allowMutationScreening({ shortId: admitted.evidence.shortId })
    : admitted
}

function recordStoredTemplateSet(
  saved: Awaited<ReturnType<typeof renameTemplateSet>>,
  templateSetId: string,
  stamp: StampAccumulator
): void {
  if (!saved.ok) throwMutationContention()
  stamp.record(templateSetAxis(templateSetId), saved.value.version)
}

function revalidateTemplateSet(shortId: string, includeList: boolean): void {
  revalidatePath(stageSetPath(shortId))
  if (includeList) revalidatePath(stageSetsPath())
}

export const templateSetRenameCommand = {
  screen: ({ executor, actor, args }) =>
    screenTemplateSet(executor, actor, args.templateSetId),
  admit: ({ tx, actor, args }) =>
    admitTemplateSet(tx, actor, args.templateSetId),
  async execute({ tx, args, evidence, stamp }) {
    const saved = await renameTemplateSet(
      evidence.id,
      args.name,
      evidence.version,
      tx
    )
    recordStoredTemplateSet(saved, evidence.id, stamp)
    return acceptMutation()
  },
  finalizeAccepted({ projection }) {
    revalidateTemplateSet(projection.shortId, true)
  },
} satisfies TemplateSetMutationCommand<typeof templateSetRename>

export const templateSetEventsCommand = {
  screen: ({ executor, actor, args }) =>
    screenTemplateSet(executor, actor, args.templateSetId),
  admit: ({ tx, actor, args }) =>
    admitTemplateSet(tx, actor, args.templateSetId),
  async execute({ tx, args, evidence, stamp }) {
    let content
    try {
      content = reduceTemplateSetEvents(evidence.content, args.events)
    } catch {
      return refuseMutation("template-set-event-refused" as const)
    }
    const saved = await saveTemplateSetContent(
      evidence.id,
      content,
      evidence.version,
      tx
    )
    recordStoredTemplateSet(saved, evidence.id, stamp)
    return acceptMutation()
  },
  finalizeAccepted({ projection }) {
    revalidateTemplateSet(projection.shortId, false)
  },
} satisfies TemplateSetMutationCommand<typeof templateSetEvents>
