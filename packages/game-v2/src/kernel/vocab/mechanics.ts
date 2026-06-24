/**
 * Mechanic-kind vocabulary, re-declared in v2 (D32). The closed set of unique
 * Archetype mechanic identifiers — the discriminant of every persisted mechanic
 * state and the key of the engine-owned mechanics registry.
 *
 * A neutral kernel primitive (like {@link ./lineage}): both the `archetypes`
 * domain (an Archetype declares which mechanic it owns) and the `mechanics`
 * domain (the registry + the `Mechanics` component's `states` map) key off it, so
 * homing it in the kernel keeps those two siblings from importing each other.
 * Kept zod-free; consuming schemas build their own `z.enum` from this tuple.
 */
export const MECHANIC_KINDS = [
  "perfection",
  "valor",
  "path-of-dawn",
  "path-of-dusk",
  "stains",
  "thiefs-insight",
  "elemental-larceny",
  "enchantment",
  "frenzy",
] as const

export type MechanicKind = (typeof MECHANIC_KINDS)[number]
