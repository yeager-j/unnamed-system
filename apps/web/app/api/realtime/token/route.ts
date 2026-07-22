import { z } from "zod/v4"

import { realtimeNamespace } from "@/lib/realtime/channels"
import { getAblyRest } from "@/lib/realtime/client"

/**
 * Issues subscribe-only Ably token requests for Headcanon axis channels. The
 * admitted body is `{capability}`, carrying the exact hashed channels a root
 * observes. The package derives those names client-side (SHA-256 over the axis
 * id under this deployment's namespace), so the route cannot resolve them
 * itself; instead it validates that every requested channel sits inside this
 * deployment's axis namespace and that every grant is subscribe-only. Axis
 * invalidation payloads carry only `{eventId, axis, revision}` — metadata, no
 * domain state — so the knowledge-free model holds. `GET` exposes the
 * namespace so the client can derive channel names at all.
 *
 * The token request is signed locally from the API key (no Ably round-trip).
 * With `ABLY_API_KEY` unset, responds 503 `{available: false}` so clients run
 * their degraded path (Decision 3).
 */

const AXIS_CHANNEL_PATTERN = /^headcanon:axis:v1:[0-9a-f]{64}$/

const AxisCapabilitySchema = z.object({
  capability: z.record(z.string(), z.tuple([z.literal("subscribe")])),
})

/** Every requested channel must be `{namespace}:headcanon:axis:v1:{sha256hex}`
 *  for **this** deployment's namespace — nothing else is grantable here. */
function isValidAxisCapability(
  capability: Record<string, ["subscribe"]>
): boolean {
  const prefix = `${realtimeNamespace()}:`
  const channels = Object.keys(capability)
  return (
    channels.length > 0 &&
    channels.length <= 128 &&
    channels.every(
      (channel) =>
        channel.startsWith(prefix) &&
        AXIS_CHANNEL_PATTERN.test(channel.slice(prefix.length))
    )
  )
}

export async function GET() {
  const client = getAblyRest()
  if (!client) {
    return Response.json({ available: false }, { status: 503 })
  }
  return Response.json({ available: true, namespace: realtimeNamespace() })
}

export async function POST(request: Request) {
  const client = getAblyRest()
  if (!client) {
    return Response.json({ available: false }, { status: 503 })
  }

  const body = await request.json().catch(() => null)

  const axis = AxisCapabilitySchema.safeParse(body)
  if (axis.success) {
    if (!isValidAxisCapability(axis.data.capability)) {
      return Response.json({ error: "Invalid capability" }, { status: 400 })
    }
    try {
      const tokenRequest = await client.auth.createTokenRequest({
        capability: axis.data.capability,
      })
      return Response.json({ tokenRequest })
    } catch (error) {
      console.error("Realtime axis token request failed", error)
      return Response.json({ available: false }, { status: 503 })
    }
  }

  return Response.json({ error: "Invalid request" }, { status: 400 })
}
