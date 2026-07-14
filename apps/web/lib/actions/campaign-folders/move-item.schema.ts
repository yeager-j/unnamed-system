import { z } from "zod/v4"

/** Input schemas for the item "Move to…" actions (UNN-579, D11; beats UNN-617). */
export const MoveArticleToFolderSchema = z.object({
  campaignId: z.string(),
  articleId: z.string(),
  folderId: z.string().nullable(),
})

export const MoveNpcToFolderSchema = z.object({
  campaignId: z.string(),
  entityId: z.string(),
  folderId: z.string().nullable(),
})

export const MoveBeatToFolderSchema = z.object({
  campaignId: z.string(),
  beatId: z.string(),
  folderId: z.string().nullable(),
})

export type MoveArticleToFolderInput = z.input<typeof MoveArticleToFolderSchema>
export type MoveNpcToFolderInput = z.input<typeof MoveNpcToFolderSchema>
export type MoveBeatToFolderInput = z.input<typeof MoveBeatToFolderSchema>

export type MoveItemActionError =
  | "invalid-input"
  | "item-not-found"
  | "folder-not-found"
