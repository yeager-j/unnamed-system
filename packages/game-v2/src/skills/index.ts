// The `skills` domain: the composed Skill shape (a flat base + orthogonal optional
// capability facets + presence guards, mirroring `Item` — PR-S / UNN-506 / D32) plus
// the cost/cast primitives and the Skill→AttackRollContext bridge.
export * from "./attack-context"
export * from "./cost"
export * from "./skill.schema"
