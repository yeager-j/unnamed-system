import type { EntityWriteRefusal } from "../commit/writers"

/**
 * The authority's terminal rejection vocabulary for `entity.write` (UNN-645).
 * A rejection is recorded against the client's watermark and delivered to the
 * replica as the mutation's trusted terminal outcome, so everything here must
 * be serializable and stable across deploys.
 *
 * `EntityWriteRefusal` is the Writer refusing on trusted current state — the
 * same refusals the client's optimistic `apply` can produce, arriving remotely
 * when the client predicted against a base the authority has since left
 * behind. The door codes are server-only: `"forbidden"` is an auth or
 * viewer-identity gate refusal (typed, never a `forbidden()` throw — a throw
 * would abort the transaction without advancing the watermark and strand the
 * client in ambiguous redelivery), and `"entity-load-failed"` mirrors the
 * entity door's assemble failure. `"invalid-write"` is the client-facing
 * collapse of the authority's recorded decode refusals (`invalid` /
 * `unknown-mutation` — deploy skew between this client and the server) and
 * of a malformed transport envelope: in every case this build of the client
 * produced a write the authority cannot understand, and retrying the same
 * bytes cannot help.
 */
export type EntityReplicaRejection =
  | EntityWriteRefusal
  | "forbidden"
  | "entity-load-failed"
  | "invalid-write"
