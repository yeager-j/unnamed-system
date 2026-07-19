import type { MapInstanceReplicaRejection } from "./mutations"

export type { MapInstanceReplicaRejection } from "./mutations"

export type MapInstanceDispatchError =
  | MapInstanceReplicaRejection
  | "write-unavailable"
