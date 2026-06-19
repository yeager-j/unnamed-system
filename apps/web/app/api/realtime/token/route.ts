import { z } from "zod/v4"

import { realtimeChannelName } from "@/lib/realtime/channels"
import { getAblyRest } from "@/lib/realtime/client"

/**
 * Issues Ably token requests for realtime subscribers (realtime ADR, Decisions
 * 4 and 7). No auth gate — knowledge of the public `shortId` *is* the
 * subscribe capability, the same model the public sheet and the snapshot API
 * already use. The client sends `{domain, shortId}`; the server resolves the
 * environment-namespaced channel name itself (clients never assemble names, so
 * one preview can't attach to another's channels) and returns it alongside a
 * token request whose capability is **subscribe-only on exactly that channel**
 * — publish capability never leaves the server.
 *
 * The token request is signed locally from the API key (no Ably round-trip).
 * With `ABLY_API_KEY` unset, responds 503 `{available: false}` so clients run
 * the polling fallback (Decision 3).
 */

const RealtimeTokenSchema = z.object({
  domain: z.enum(["character", "encounter", "dungeon"]),
  shortId: z.string().min(1),
})

export async function POST(request: Request) {
  const client = getAblyRest()
  if (!client) {
    return Response.json({ available: false }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  const parsed = RealtimeTokenSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 })
  }

  const channel = realtimeChannelName(parsed.data.domain, parsed.data.shortId)
  try {
    const tokenRequest = await client.auth.createTokenRequest({
      capability: { [channel]: ["subscribe"] },
    })
    return Response.json({ channel, tokenRequest })
  } catch (error) {
    console.error(`Realtime token request failed for ${channel}`, error)
    return Response.json({ available: false }, { status: 503 })
  }
}
