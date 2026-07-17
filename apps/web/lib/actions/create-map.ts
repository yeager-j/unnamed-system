"use server"

import { unauthorized } from "next/navigation"

import { ok, type Result } from "@workspace/game-v2/kernel/result"

import { auth } from "@/lib/auth"
import { createMap } from "@/lib/db/writes/map"

import {
  CreateMapSchema,
  type CreateMapError,
  type CreateMapInput,
} from "./create-map.schema"

/**
 * Creates an empty Map owned by the signed-in caller and returns its public
 * `shortId` so the client can redirect to the editor (`/stage/maps/{shortId}`) —
 * mirroring `createCampaignAction`. The only auth gate is "must be signed in";
 * anyone can author their own Maps.
 */
export async function createMapAction(
  input: CreateMapInput
): Promise<Result<{ shortId: string }, CreateMapError>> {
  const session = await auth()
  if (!session?.user?.id) unauthorized()

  const parsed = CreateMapSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const { shortId } = await createMap({
    userId: session.user.id,
    name: parsed.data.name,
  })

  return ok({ shortId })
}
