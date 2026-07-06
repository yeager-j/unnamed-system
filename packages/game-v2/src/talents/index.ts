/**
 * The `talents` domain: the entity-authored reference shape ({@link
 * import("./talents.schema")}), the closed rulebook key vocabulary + display catalog
 * ({@link import("./vocab")} / {@link import("./catalog")}, engine-owned per CH10),
 * and the derivation family ({@link import("./resolve")}) that unions owned +
 * active-Archetype Talents for the sheet and builder.
 */
export * from "./talents.schema"
export * from "./vocab"
export * from "./catalog"
export * from "./resolve"
