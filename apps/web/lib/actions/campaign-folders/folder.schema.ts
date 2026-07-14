import { z } from "zod/v4"

import { displayNameSchema } from "../display-name.schema"

const folderKindSchema = z.enum(["article", "npc", "session"])

/** Input schemas for the folder CRUD actions (UNN-579, D11; sessions UNN-617). */
export const CreateFolderSchema = z.object({
  campaignId: z.string(),
  kind: folderKindSchema,
  name: displayNameSchema,
  parentId: z.string().nullable(),
})

export const RenameFolderSchema = z.object({
  campaignId: z.string(),
  folderId: z.string(),
  name: displayNameSchema,
})

export const MoveFolderSchema = z.object({
  campaignId: z.string(),
  folderId: z.string(),
  parentId: z.string().nullable(),
})

export const DeleteFolderSchema = z.object({
  campaignId: z.string(),
  folderId: z.string(),
})

export type CreateFolderInput = z.input<typeof CreateFolderSchema>
export type RenameFolderInput = z.input<typeof RenameFolderSchema>
export type MoveFolderInput = z.input<typeof MoveFolderSchema>
export type DeleteFolderInput = z.input<typeof DeleteFolderSchema>

export type FolderActionError = "invalid-input" | "folder-not-found"
export type MoveFolderActionError = FolderActionError | "folder-cycle"
