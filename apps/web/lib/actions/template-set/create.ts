"use server"

import { unauthorized } from "next/navigation"

import { ok, type Result } from "@workspace/result"

import { auth } from "@/lib/auth"
import { createTemplateSet } from "@/lib/db/writes/template-set"

import {
  CreateTemplateSetSchema,
  type CreateTemplateSetError,
  type CreateTemplateSetInput,
} from "./create.schema"

/**
 * Creates an empty Template Set owned by the signed-in caller and returns its
 * public `shortId` so the client can redirect to the editor (`/stage/sets/{shortId}`)
 * — mirroring `createMapAction`. The only auth gate is "must be signed in";
 * anyone can author their own Sets.
 */
export async function createTemplateSetAction(
  input: CreateTemplateSetInput
): Promise<Result<{ shortId: string }, CreateTemplateSetError>> {
  const session = await auth()
  if (!session?.user?.id) unauthorized()

  const parsed = CreateTemplateSetSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const { shortId } = await createTemplateSet({
    userId: session.user.id,
    name: parsed.data.name,
  })

  return ok({ shortId })
}
