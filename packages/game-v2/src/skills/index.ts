// The `skills` domain: the composed Skill shape (a flat base + orthogonal optional
// capability facets + presence guards, mirroring `Item` — PR-S / UNN-506 / D32) plus
// the cost/cast primitives, the Skill→AttackRollContext bridge, and the
// entity-agnostic resolved-Skill read-unit (cost + Attack Roll for any caster).
export * from "./attack-context"
export * from "./cost"
export * from "./resolved"
export * from "./skill.schema"
