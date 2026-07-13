import { and, eq } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import { isDescendant } from "@/domain/planner/view/world-tree"
import { db, type WriteExecutor } from "@/lib/db/client"
import {
  campaignArticle,
  campaignFolder,
  campaignNpc,
  type WorldFolderKind,
} from "@/lib/db/schema/campaign-world"

/**
 * Persistence for the **world folder trees** (UNN-579, tech-design D11).
 * Auth-free like every write wrapper — `requireCampaignDM` lives at the
 * Server Action boundary — and every target scopes by `(id, campaignId)`
 * (§5).
 *
 * Structure carries the guards here, not content: a parent must be a
 * same-campaign **same-kind** folder (the composite FK backstops kind, this
 * validation turns a violation into a domain error), and a move rejects any
 * parent inside the moved folder's own subtree (the D11 cycle guard — the
 * self-FK cannot express acyclicity). Deletes are plain: the composite
 * self-FK cascades the subtree while item `folderId`s SET NULL to the
 * derived Unfiled.
 */

export type FolderWriteError = "folder-not-found"

/** Creates a folder, at the root (`parentId` null) or under a validated parent. */
export async function createFolder(input: {
  campaignId: string
  kind: WorldFolderKind
  name: string
  parentId: string | null
}): Promise<Result<{ id: string }, FolderWriteError>> {
  return db.transaction(async (tx) => {
    if (input.parentId !== null) {
      const parent = await folderInCampaign(
        tx,
        input.campaignId,
        input.parentId
      )
      if (!parent || parent.kind !== input.kind) return err("folder-not-found")
    }
    const [row] = await tx
      .insert(campaignFolder)
      .values({
        campaignId: input.campaignId,
        kind: input.kind,
        name: input.name,
        parentId: input.parentId,
      })
      .returning({ id: campaignFolder.id })
    return ok(row!)
  })
}

/** Renames a folder. LWW. */
export async function renameFolder(input: {
  campaignId: string
  folderId: string
  name: string
}): Promise<Result<void, FolderWriteError>> {
  const renamed = await db
    .update(campaignFolder)
    .set({ name: input.name })
    .where(
      and(
        eq(campaignFolder.id, input.folderId),
        eq(campaignFolder.campaignId, input.campaignId)
      )
    )
    .returning({ id: campaignFolder.id })
  return renamed.length === 0 ? err("folder-not-found") : ok(undefined)
}

export type MoveFolderError = FolderWriteError | "folder-cycle"

/**
 * Re-parents a folder (null ⇒ root). One transaction: the campaign's folder
 * set is loaded once, the new parent validated same-kind, and the pure
 * `isDescendant` walk rejects a parent inside the moved subtree — the same
 * function the Move-to menu uses to disable those rows, so client and server
 * cannot disagree about what a cycle is.
 */
export async function moveFolder(input: {
  campaignId: string
  folderId: string
  parentId: string | null
}): Promise<Result<void, MoveFolderError>> {
  return db.transaction(async (tx) => {
    const folders = await tx
      .select({
        id: campaignFolder.id,
        parentId: campaignFolder.parentId,
        kind: campaignFolder.kind,
        name: campaignFolder.name,
      })
      .from(campaignFolder)
      .where(eq(campaignFolder.campaignId, input.campaignId))

    const moved = folders.find((folder) => folder.id === input.folderId)
    if (!moved) return err("folder-not-found")

    if (input.parentId !== null) {
      const parent = folders.find((folder) => folder.id === input.parentId)
      if (!parent || parent.kind !== moved.kind) return err("folder-not-found")
      if (isDescendant(folders, input.folderId, input.parentId)) {
        return err("folder-cycle")
      }
    }

    await tx
      .update(campaignFolder)
      .set({ parentId: input.parentId })
      .where(eq(campaignFolder.id, input.folderId))
    return ok(undefined)
  })
}

/**
 * Deletes a folder — hard, one statement: the composite self-FK cascades the
 * subtree's folders while every contained item floats to Unfiled via its
 * SET-NULL FK (D11).
 */
export async function deleteFolder(input: {
  campaignId: string
  folderId: string
}): Promise<Result<void, FolderWriteError>> {
  const deleted = await db
    .delete(campaignFolder)
    .where(
      and(
        eq(campaignFolder.id, input.folderId),
        eq(campaignFolder.campaignId, input.campaignId)
      )
    )
    .returning({ id: campaignFolder.id })
  return deleted.length === 0 ? err("folder-not-found") : ok(undefined)
}

export type MoveItemError = "item-not-found" | "folder-not-found"

/** Moves an Article between folders (null ⇒ Unfiled). Organizational only. */
export async function moveArticleToFolder(input: {
  campaignId: string
  articleId: string
  folderId: string | null
}): Promise<Result<void, MoveItemError>> {
  return db.transaction(async (tx) => {
    const target = await guardTargetFolder(tx, input, "article")
    if (!target.ok) return target
    const moved = await tx
      .update(campaignArticle)
      .set({ folderId: input.folderId })
      .where(
        and(
          eq(campaignArticle.id, input.articleId),
          eq(campaignArticle.campaignId, input.campaignId)
        )
      )
      .returning({ id: campaignArticle.id })
    return moved.length === 0 ? err("item-not-found") : ok(undefined)
  })
}

/** Moves an NPC between folders (null ⇒ Unfiled). Organizational only. */
export async function moveNpcToFolder(input: {
  campaignId: string
  entityId: string
  folderId: string | null
}): Promise<Result<void, MoveItemError>> {
  return db.transaction(async (tx) => {
    const target = await guardTargetFolder(tx, input, "npc")
    if (!target.ok) return target
    const moved = await tx
      .update(campaignNpc)
      .set({ folderId: input.folderId })
      .where(
        and(
          eq(campaignNpc.entityId, input.entityId),
          eq(campaignNpc.campaignId, input.campaignId)
        )
      )
      .returning({ entityId: campaignNpc.entityId })
    return moved.length === 0 ? err("item-not-found") : ok(undefined)
  })
}

/** The §5 boundary check for item membership: same campaign, same kind. */
async function guardTargetFolder(
  tx: WriteExecutor,
  input: { campaignId: string; folderId: string | null },
  kind: WorldFolderKind
): Promise<Result<void, "folder-not-found">> {
  if (input.folderId === null) return ok(undefined)
  const folder = await folderInCampaign(tx, input.campaignId, input.folderId)
  if (!folder || folder.kind !== kind) return err("folder-not-found")
  return ok(undefined)
}

async function folderInCampaign(
  tx: WriteExecutor,
  campaignId: string,
  folderId: string
): Promise<{ kind: WorldFolderKind } | undefined> {
  const [row] = await tx
    .select({ kind: campaignFolder.kind })
    .from(campaignFolder)
    .where(
      and(
        eq(campaignFolder.id, folderId),
        eq(campaignFolder.campaignId, campaignId)
      )
    )
  return row
}
