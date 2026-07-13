import { z } from "zod/v4"

import type { BindDeadlineMarkerError } from "@/lib/db/writes/campaign-updates"

/**
 * Input schemas for {@link import("./resolve-deadline").resolveDeadlineAction}
 * and {@link import("./resolve-deadline").reopenDeadlineAction} (D5). The
 * resolve prose is optional — a blank body defaults to
 * `"Resolved — ⟨article name⟩"` so the ⚑ marker never violates the
 * "empty body only for idle" app rule while one-click resolve stays fast.
 */
export const ResolveDeadlineSchema = z.object({
  campaignId: z.string(),
  articleId: z.string(),
  body: z.string().trim().max(10_000).default(""),
})

export type ResolveDeadlineInput = z.input<typeof ResolveDeadlineSchema>

export type ResolveDeadlineActionError =
  | "invalid-input"
  | "clock-not-found"
  | "article-not-found"
  | "not-a-deadline"

export const ReopenDeadlineSchema = z.object({
  campaignId: z.string(),
  articleId: z.string(),
})

export type ReopenDeadlineInput = z.input<typeof ReopenDeadlineSchema>

export type ReopenDeadlineActionError = "invalid-input" | "not-resolved"

export const BindDeadlineMarkerSchema = z.object({
  campaignId: z.string(),
  articleId: z.string(),
  updateId: z.string(),
})

export type BindDeadlineMarkerInput = z.input<typeof BindDeadlineMarkerSchema>

export type BindDeadlineMarkerActionError =
  | "invalid-input"
  | BindDeadlineMarkerError
