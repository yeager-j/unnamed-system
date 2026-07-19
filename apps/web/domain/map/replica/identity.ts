import type { ClientIdentity } from "@workspace/replica"

export function mintMapInstanceIdentity(mapInstanceId: string): ClientIdentity {
  return {
    clientGroupId: `map-instance:${mapInstanceId}`,
    clientId: crypto.randomUUID(),
  }
}
